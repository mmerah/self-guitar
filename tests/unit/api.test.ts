import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

// Point the app's database at a throwaway directory before any server module loads.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'self-guitar-test-'));

// Handlers only read the event fields each test passes in.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (event: any) => Response | Promise<Response>;
let songs: { GET: Handler };
let song: { GET: Handler };
let progress: { GET: Handler; PUT: Handler };
let health: { GET: Handler };
let allProgress: { GET: Handler };

beforeAll(async () => {
	songs = await import('../../src/routes/api/songs/+server');
	song = await import('../../src/routes/api/songs/[id]/+server');
	progress = await import('../../src/routes/api/songs/[id]/progress/+server');
	health = await import('../../src/routes/api/health/+server');
	allProgress = await import('../../src/routes/api/progress/+server');
});

const put = (id: string, body: unknown) =>
	progress.PUT({
		params: { id },
		request: new Request('http://x', { method: 'PUT', body: JSON.stringify(body) })
	});

/** SvelteKit's error() throws an HttpError object; normalise to its status. */
async function status(fn: () => unknown) {
	try {
		const res = (await fn()) as Response;
		return res.status;
	} catch (e) {
		return (e as { status: number }).status;
	}
}

describe('API', () => {
	it('reports health and creates the database', async () => {
		const res = await health.GET({});
		expect(await res.json()).toEqual({ ok: true });
		expect(fs.existsSync(path.join(process.env.DATA_DIR!, 'self-guitar.db'))).toBe(true);
	});

	it('lists songs without the score text, sorted by level', async () => {
		const list = await (await songs.GET({})).json();
		expect(list.length).toBeGreaterThanOrEqual(10);
		expect(list.find((s: { id: string }) => s.id === 'greensleeves')).toMatchObject({
			bars: 17,
			pickup: true
		});
		expect(list[0]).not.toHaveProperty('tex');
		const levels = list.map((s: { level: number }) => s.level);
		expect(levels).toEqual([...levels].sort((a, b) => a - b));
	});

	it('returns one song with its alphaTex, 404 otherwise', async () => {
		const one = await (await song.GET({ params: { id: 'ode-to-joy' } })).json();
		expect(one.title).toBe('Ode to Joy');
		expect(one.tex).toContain('\\title');
		expect(await status(() => song.GET({ params: { id: 'nope' } }))).toBe(404);
	});

	it('stores tempo and loop, tracking max played tempo only when played', async () => {
		const empty = await (await progress.GET({ params: { id: 'greensleeves' } })).json();
		expect(empty).toMatchObject({ tempoPct: 100, maxPlayedTempoPct: null, loopStartBar: null });

		await put('greensleeves', { tempoPct: 70, loopStartBar: 1, loopEndBar: 4, played: true });
		const saved = await (
			await put('greensleeves', { tempoPct: 90, loopStartBar: null, loopEndBar: null })
		).json();
		expect(saved).toMatchObject({ tempoPct: 90, maxPlayedTempoPct: 70, loopStartBar: null });
		expect(saved.lastPlayedAt).not.toBeNull();

		const again = await (await progress.GET({ params: { id: 'greensleeves' } })).json();
		expect(again.tempoPct).toBe(90);
	});

	it('validates progress input', async () => {
		expect(
			await status(() =>
				put('greensleeves', { tempoPct: 10, loopStartBar: null, loopEndBar: null })
			)
		).toBe(400);
		expect(
			await status(() => put('greensleeves', { tempoPct: 80, loopStartBar: 5, loopEndBar: 2 }))
		).toBe(400);
		expect(
			await status(() => put('nope', { tempoPct: 80, loopStartBar: null, loopEndBar: null }))
		).toBe(404);
		// Greensleeves has 17 bars (pickup included): indexes 0-16.
		expect(
			await status(() => put('greensleeves', { tempoPct: 80, loopStartBar: 3, loopEndBar: 17 }))
		).toBe(400);
		expect(
			await status(() => put('greensleeves', { tempoPct: 80, loopStartBar: 3, loopEndBar: 16 }))
		).toBe(200);
	});

	it('lists progress, most recently played first', async () => {
		await put('ode-to-joy', { tempoPct: 60, loopStartBar: null, loopEndBar: null });
		await new Promise((r) => setTimeout(r, 1100)); // timestamps have 1 s resolution
		await put('scarborough-fair', {
			tempoPct: 70,
			loopStartBar: null,
			loopEndBar: null,
			played: true
		});
		const list = await (await allProgress.GET({})).json();
		expect(list[0]).toMatchObject({ songId: 'scarborough-fair', tempoPct: 70 });
		expect(list.map((p: { songId: string }) => p.songId)).toContain('ode-to-joy');
	});
});
