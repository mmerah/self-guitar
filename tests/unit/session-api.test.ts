import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import { api } from './api-context';
import type { LearnIndex } from '../../src/lib/learn/types';
import type { Plan, StoredSession } from '../../src/lib/session/types';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'self-guitar-session-'));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (event: any) => Response | Promise<Response>;
let plan: { GET: Handler };
let start: { POST: Handler };
let today: { GET: Handler };
let block: { PUT: Handler };
let end: { POST: Handler };
let history: { GET: Handler };
let goals: { GET: Handler };
let settings: { GET: Handler; PUT: Handler };
let lesson: { PUT: Handler };
let db: typeof import('../../src/lib/server/db');
let schema: typeof import('../../src/lib/core/db/schema');
let learn: LearnIndex;

beforeAll(async () => {
	plan = api('/api/session/plan');
	start = api('/api/session');
	today = api('/api/session/today');
	block = api('/api/session/[id]/blocks/[idx]');
	end = api('/api/session/[id]/end');
	history = api('/api/history');
	goals = api('/api/goals');
	settings = api('/api/settings');
	lesson = api('/api/learn/lessons/[id]');
	db = await import('../../src/lib/server/db');
	schema = await import('../../src/lib/core/db/schema');
	learn = await (await api('/api/learn').GET()).json();
});

const DATE = '2026-11-03';
const url = (p: string) => ({ url: new URL(`http://x${p}`) });
const req = (body: unknown, method = 'POST') =>
	new Request('http://x', { method, body: typeof body === 'string' ? body : JSON.stringify(body) });

async function status(fn: () => unknown) {
	try {
		return ((await fn()) as Response).status;
	} catch (e) {
		return (e as { status: number }).status;
	}
}

const getPlan = async (minutes = 15): Promise<Plan> =>
	(await plan.GET(url(`/api/session/plan?minutes=${minutes}&date=${DATE}&tz=0`))).json();

describe('session API', () => {
	it('validates every input with a 400', async () => {
		for (const q of [
			'',
			'?date=2026-13-01',
			`?date=${DATE}&minutes=3`,
			`?date=${DATE}&minutes=x`,
			`?date=${DATE}&tz=9999`,
			`?date=${DATE}&bogus=1`
		])
			expect(await status(() => plan.GET(url(`/api/session/plan${q}`)))).toBe(400);
		const id = randomUUID();
		const good = { id, date: DATE, minutes: 15 };
		for (const bad of [
			'{',
			null,
			{ ...good, id: 'nope' },
			{ ...good, minutes: 45 },
			{ ...good, date: '3 Nov' },
			{ ...good, extra: 1 },
			{ ...good, blocks: [] },
			{
				...good,
				blocks: [
					{
						kind: 'warmup',
						title: 'x',
						minutes: 2,
						why: '',
						target: { type: 'exercise', id: 'no-such' }
					}
				]
			},
			{
				...good,
				blocks: [
					{
						kind: 'nap',
						title: 'x',
						minutes: 2,
						why: '',
						target: { type: 'tool', id: 'tuner', params: {} }
					}
				]
			},
			{
				...good,
				blocks: [
					{
						kind: 'song',
						title: 'x',
						minutes: 2,
						why: '',
						target: { type: 'song', id: 'ode-to-joy', tempoPct: 70, loop: { start: 0, end: 999 } }
					}
				]
			},
			{
				...good,
				blocks: [
					{
						kind: 'technique',
						title: 'x',
						minutes: 2,
						why: '',
						target: { type: 'changes', a: 'C', b: 'Zz9', target: 30 }
					}
				]
			}
		])
			expect(await status(() => start.POST({ request: req(bad as never) }))).toBe(400);
		expect(await status(() => today.GET(url('/api/session/today?date=x')))).toBe(400);
		expect(await status(() => history.GET(url('/api/history')))).toBe(400);
		expect(await status(() => goals.GET(url('/api/goals?date=2026-02-30x')))).toBe(400);
		expect(
			await status(() =>
				settings.PUT({ request: req({ weeklyDays: 9, dailyMin: 15, sessionMin: 15 }, 'PUT') })
			)
		).toBe(400);
		expect(await status(() => settings.PUT({ request: req({ weeklyDays: 5 }, 'PUT') }))).toBe(400);
	});

	it('plans a new user session that adds up to the length', async () => {
		const p = await getPlan(10);
		expect(p.blocks.reduce((a, b) => a + b.minutes, 0)).toBe(10);
		expect(p.blocks.find((b) => b.kind === 'new')?.target).toEqual({
			type: 'lesson',
			id: learn.lessons[0].id
		});
	});

	it('starts (idempotently), completes blocks, ends with a summary and fills the history', async () => {
		const p = await getPlan(5);
		const id = randomUUID();
		const body = {
			id,
			date: DATE,
			tz: 0,
			minutes: 5,
			blocks: p.blocks,
			startedAt: Date.now() - 300_000
		};
		const res = await start.POST({ request: req(body) });
		expect(res.status).toBe(201);
		const s: StoredSession = await res.json();
		expect(s.blocks).toEqual(p.blocks);
		expect(s.results.every((r) => r === null)).toBe(true);
		// A retried start (outbox) returns the same session.
		expect((await (await start.POST({ request: req(body) })).json()).id).toBe(id);

		const put = (idx: number | string, b: unknown, sid = id) =>
			block.PUT({ params: { id: sid, idx: String(idx) }, request: req(b, 'PUT') });
		expect(await status(() => put(0, { actualSec: -1, completed: true }))).toBe(400);
		expect(await status(() => put(0, { actualSec: 60, completed: true, rating: 'meh' }))).toBe(400);
		expect(await status(() => put(99, { actualSec: 60, completed: true }))).toBe(400);
		expect(await status(() => put('x', { actualSec: 60, completed: true }))).toBe(400);
		expect(await status(() => put(0, { actualSec: 60, completed: true }, randomUUID()))).toBe(404);

		let after: StoredSession = await (
			await put(0, { actualSec: 130, completed: true, rating: 'great', bpm: 60 })
		).json();
		expect(after.results[0]).toMatchObject({
			actualSec: 130,
			rating: 'great',
			bpm: 60,
			completed: true
		});
		after = await (await put(1, { actualSec: 20, completed: false, skipped: true })).json();
		expect(after.results[1]).toMatchObject({ skipped: true, completed: false });

		const resumed: StoredSession = await (
			await today.GET(url(`/api/session/today?date=${DATE}`))
		).json();
		expect(resumed.id).toBe(id);
		expect(resumed.endedAt).toBeNull();

		const sum = await (await end.POST({ params: { id }, request: req({}) })).json();
		expect(sum).toMatchObject({ minutes: 3, blocksDone: 1, blocksTotal: p.blocks.length });
		expect(sum.pbs).toEqual([]);
		expect(await status(() => end.POST({ params: { id: randomUUID() }, request: req({}) }))).toBe(
			404
		);

		const h = await (await history.GET(url(`/api/history?date=${DATE}&tz=0`))).json();
		expect(h.days).toHaveLength(56);
		expect(h.days[55]).toEqual({ date: DATE, minutes: 3 });
		expect(h.levels[0].counts).toEqual(expect.objectContaining({ new: expect.any(Number) }));
		expect(h.totals.sessions).toBe(1);

		const g = await (await goals.GET(url(`/api/goals?date=${DATE}`))).json();
		expect(g.settings).toEqual({ weeklyDays: 5, dailyMin: 15, sessionMin: 15 });
		expect(g.week.minutes).toBe(3);
		expect(g.week.counted).toBe(0);
	});

	it('saves settings that the weekly goal uses', async () => {
		const res = await settings.PUT({
			request: req({ weeklyDays: 3, dailyMin: 5, sessionMin: 10 }, 'PUT')
		});
		expect(await res.json()).toEqual({ weeklyDays: 3, dailyMin: 5, sessionMin: 10 });
		const g = await (await goals.GET(url(`/api/goals?date=${DATE}`))).json();
		expect(g.week).toMatchObject({ goalDays: 3, dailyMin: 5, counted: 0 });
	});

	it('a rated review block moves its skills: 🙂 advances, 😖 lapses', async () => {
		const d = db.getDb();
		const { skillState } = schema;
		// Due the day before the session's day (fixed DATE), whatever day the tests run on.
		const due = new Date(Math.min(Date.now(), Date.parse(`${DATE}T12:00:00Z`)) - 86_400_000);
		d.insert(skillState)
			.values([
				{
					profileId: 1,
					skillId: 'first-strum',
					status: 'mastered',
					masteredAt: due,
					dueAt: due,
					ease: 1
				},
				{
					profileId: 1,
					skillId: 'posture',
					status: 'mastered',
					masteredAt: due,
					dueAt: due,
					ease: 3
				}
			])
			.onConflictDoNothing()
			.run();
		const blocks = [
			{
				kind: 'review',
				title: 'Review A',
				minutes: 2,
				why: 'due',
				target: { type: 'exercise', id: 'em-down-strums' },
				skills: ['first-strum']
			},
			{
				kind: 'review',
				title: 'Review B',
				minutes: 2,
				why: 'due',
				target: { type: 'lesson', id: 'meet-your-guitar' },
				skills: ['posture']
			}
		];
		const id = randomUUID();
		await start.POST({ request: req({ id, date: DATE, minutes: 5, blocks }) });
		const put = (idx: number, rating: string) =>
			block.PUT({
				params: { id, idx: String(idx) },
				request: req({ actualSec: 120, completed: true, rating, tz: 0 }, 'PUT')
			});
		await put(0, 'ok');
		await put(1, 'hard');
		// A retry must not advance twice.
		await put(0, 'ok');
		const rows = Object.fromEntries(
			d
				.select()
				.from(skillState)
				.all()
				.map((r) => [r.skillId, r])
		);
		expect(rows['first-strum']).toMatchObject({ status: 'mastered', ease: 2 });
		expect(Math.round((rows['first-strum'].dueAt!.getTime() - Date.now()) / 86_400_000)).toBe(7);
		expect(rows['posture']).toMatchObject({ status: 'learning', ease: 1 });
		expect(rows['posture'].masteredAt?.getTime()).toBe(Math.floor(due.getTime() / 1000) * 1000);

		// Derivation does not undo the lapse (the schedule owns the row).
		await lesson.PUT({
			params: { id: 'meet-your-guitar' },
			request: req({ status: 'completed' }, 'PUT')
		});
		const after = d
			.select()
			.from(skillState)
			.all()
			.find((r) => r.skillId === 'posture')!;
		expect(after.status).toBe('learning');

		const sum = await (await end.POST({ params: { id }, request: req({}) })).json();
		// Only skills this session moved (not every due or mastered one).
		expect(sum.reviewed).toEqual([
			expect.objectContaining({ skillId: 'posture', lapsed: true }),
			expect.objectContaining({ skillId: 'first-strum', lapsed: false })
		]);
		expect(sum.tomorrow).toEqual({ due: expect.any(Number), next: expect.any(String) });
	});

	it('rejects impossible dates, over-long plans, early ends, bad JSON; 409 on a foreign id', async () => {
		const p = await getPlan(10);
		const id = randomUUID();
		const good = { id, date: DATE, tz: 'Europe/Berlin', minutes: 10, blocks: p.blocks };
		expect(await status(() => start.POST({ request: req({ ...good, date: '2026-02-31' }) }))).toBe(
			400
		);
		expect(await status(() => start.POST({ request: req({ ...good, tz: 'Mars/Base' }) }))).toBe(
			400
		);
		const long = [...p.blocks, { ...p.blocks[0], minutes: 5 }];
		expect(await status(() => start.POST({ request: req({ ...good, blocks: long }) }))).toBe(400);
		expect(await status(() => goals.GET(url('/api/goals?date=2026-02-31')))).toBe(400);
		expect(
			await status(() => history.GET(url(`/api/history?date=${DATE}&tz=Europe%2FBerlin`)))
		).toBe(200);
		expect(
			await status(() => plan.GET(url(`/api/session/plan?date=${DATE}&tz=America%2FNew_York`)))
		).toBe(200);

		const started: StoredSession = await (
			await start.POST({ request: req({ ...good, startedAt: Date.now() - 60_000 }) })
		).json();
		const endAt = (b: string) => end.POST({ params: { id }, request: req(b) });
		expect(await status(() => endAt('{'))).toBe(400);
		expect(await status(() => endAt(JSON.stringify({ endedAt: started.startedAt - 1000 })))).toBe(
			400
		);
		expect(await status(() => endAt(''))).toBe(200);

		// The same id under another profile: a conflict, not a server error.
		const d = db.getDb();
		d.insert(schema.profile).values({ id: 2, name: 'Other' }).onConflictDoNothing().run();
		const other = randomUUID();
		d.insert(schema.practiceSession)
			.values({
				id: other,
				profileId: 2,
				date: DATE,
				plannedMin: 10,
				startedAt: new Date(),
				planJson: '[]'
			})
			.run();
		expect(await status(() => start.POST({ request: req({ ...good, id: other }) }))).toBe(409);
	});

	it('a session open across midnight is still the open one; a new start ends stale ones', async () => {
		const open = api('/api/session');
		const p = await getPlan(10);
		const id = randomUUID();
		await start.POST({
			request: req({
				id,
				date: '2026-11-02',
				minutes: 10,
				blocks: p.blocks,
				startedAt: Date.now() - 20 * 60_000
			})
		});
		await block.PUT({
			params: { id, idx: '0' },
			request: req({ actualSec: 120, completed: true, rating: 'ok' }, 'PUT')
		});
		expect((await (await open.GET()).json()).id).toBe(id);
		const next = randomUUID();
		await start.POST({ request: req({ id: next, date: DATE, minutes: 10, blocks: p.blocks }) });
		const prev = d0()
			.select()
			.from(schema.practiceSession)
			.all()
			.find((x) => x.id === id)!;
		// Ended at its last activity: start + the time played.
		expect(prev.endedAt!.getTime() - prev.startedAt.getTime()).toBe(120_000);
		expect((await (await open.GET()).json()).id).toBe(next);
	});
});

const d0 = () => db.getDb();

describe('migration from an M3 database', () => {
	it('adds the M4 tables and schedules already mastered skills', async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'self-guitar-m3-'));
		const m3 = path.join(dir, 'migrations');
		fs.mkdirSync(path.join(m3, 'meta'), { recursive: true });
		const journal = JSON.parse(fs.readFileSync('drizzle/meta/_journal.json', 'utf8'));
		journal.entries = journal.entries.filter((e: { tag: string }) => e.tag < '0003');
		fs.writeFileSync(path.join(m3, 'meta/_journal.json'), JSON.stringify(journal));
		for (const e of journal.entries)
			fs.copyFileSync(`drizzle/${e.tag}.sql`, path.join(m3, `${e.tag}.sql`));

		const file = path.join(dir, 'm3.db');
		const sqlite = new Database(file);
		migrate(drizzle(sqlite), { migrationsFolder: m3 });
		const masteredAt = Math.floor(Date.now() / 1000) - 5 * 86400;
		sqlite.exec(`insert into profile(id, name) values (1, 'Default');
			insert into skill_state(profile_id, skill_id, status, mastered_at) values (1, 'posture', 'mastered', ${masteredAt}), (1, 'read-tab', 'learning', null);
			insert into chord_change_record(profile_id, chord_a, chord_b, count) values (1, 'A', 'D', 22);`);
		sqlite.close();

		const m4 = db.openDb(file);
		const rows = m4.select().from(schema.skillState).all();
		expect(rows.find((r) => r.skillId === 'posture')).toMatchObject({
			status: 'mastered',
			ease: 0
		});
		expect(rows.find((r) => r.skillId === 'posture')!.dueAt!.getTime()).toBe(
			(masteredAt + 86400) * 1000
		);
		expect(rows.find((r) => r.skillId === 'read-tab')).toMatchObject({ dueAt: null });
		expect(m4.select().from(schema.practiceSession).all()).toEqual([]);
		expect(m4.select().from(schema.chordChangeRecord).all()).toHaveLength(1);
	});
});
