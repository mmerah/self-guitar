import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { api } from './api-context';
import { canonicalPair } from '../../src/lib/chordChanges';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'self-guitar-changes-'));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (event: any) => Response | Promise<Response>;
let changes: { GET: Handler; POST: Handler };

beforeAll(async () => {
	changes = api('/api/chord-changes');
});

const post = (body: unknown) =>
	changes.POST({
		request: new Request('http://x', { method: 'POST', body: JSON.stringify(body) })
	});

async function status(fn: () => unknown) {
	try {
		return ((await fn()) as Response).status;
	} catch (e) {
		return (e as { status: number }).status;
	}
}

describe('chord-change records API', () => {
	it('orders pairs canonically', () => {
		expect(canonicalPair('G', 'C')).toEqual(['C', 'G']);
		expect(canonicalPair('Am', 'E')).toEqual(['Am', 'E']);
	});

	it('saves results under one pair whatever the order, tracking best and history', async () => {
		const first = await post({ chordA: 'G', chordB: 'C', count: 18 });
		expect(first.status).toBe(201);
		expect(await first.json()).toMatchObject({ chordA: 'C', chordB: 'G', best: 18, tries: 1 });
		await post({ chordA: 'C', chordB: 'G', count: 25 });
		const third = await (await post({ chordA: 'G', chordB: 'C', count: 22 })).json();
		expect(third).toMatchObject({ chordA: 'C', chordB: 'G', best: 25, tries: 3 });
		expect(third.history.map((h: { count: number }) => h.count)).toEqual([18, 25, 22]);
	});

	it('lists every pair', async () => {
		await post({ chordA: 'D', chordB: 'A', count: 30 });
		const pairs = await (await changes.GET({})).json();
		expect(pairs).toHaveLength(2);
		expect(pairs.find((p: { chordA: string }) => p.chordA === 'A')).toMatchObject({
			chordB: 'D',
			best: 30
		});
	});

	it('validates input', async () => {
		expect(await status(() => post({ chordA: 'C', chordB: 'C', count: 5 }))).toBe(400);
		expect(await status(() => post({ chordA: 'C', chordB: 'H', count: 5 }))).toBe(400);
		expect(await status(() => post({ chordA: 'C', chordB: 'G', count: -1 }))).toBe(400);
		expect(await status(() => post({ chordA: 'C', chordB: 'G', count: 2.5 }))).toBe(400);
		expect(await status(() => post({ chordA: 'C', chordB: 'G', count: 5, extra: 1 }))).toBe(400);
		expect(await status(() => post(null))).toBe(400);
	});

	it('stores any enharmonic spelling under the canonical chord', async () => {
		const res = await (await post({ chordA: 'Db', chordB: 'A#', count: 12 })).json();
		expect(res).toMatchObject({ chordA: 'Bb', chordB: 'C#', best: 12, tries: 1 });
	});
});
