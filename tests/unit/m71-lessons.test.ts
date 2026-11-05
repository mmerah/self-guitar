// M7.1: opening a lesson is a preview (nothing stored); practice, "Start lesson", Next or the
// session start it; a reset takes it back (history kept, skills re-derived); a one-time cleanup
// resets lessons that were started by opening them alone.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { api } from './api-context';
import type { LearnIndex, LearnProgress, LessonMeta } from '../../src/lib/learn/types';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'self-guitar-m71-'));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (event: any) => Response | Promise<Response>;
let progress: { GET: Handler };
let lessonApi: { GET: Handler; PUT: Handler };
let reset: { POST: Handler };
let mastery: { POST: Handler };
let attempts: { POST: Handler };
let ear: { POST: Handler };
let plan: { GET: Handler };
let db: typeof import('../../src/lib/server/db');
let schema: typeof import('../../src/lib/core/db/schema');
let core: typeof import('../../src/lib/core/learn');
let learn: LearnIndex;

beforeAll(async () => {
	progress = api('/api/learn/progress');
	lessonApi = api('/api/learn/lessons/[id]');
	reset = api('/api/learn/lessons/[id]/reset');
	mastery = api('/api/learn/lessons/[id]/mastery');
	attempts = api('/api/exercises/[id]/attempts');
	ear = api('/api/ear');
	plan = api('/api/session/plan');
	db = await import('../../src/lib/server/db');
	schema = await import('../../src/lib/core/db/schema');
	core = await import('../../src/lib/core/learn');
	learn = await (await api('/api/learn').GET({})).json();
});

const req = (body: unknown, method = 'POST') =>
	new Request('http://x', { method, body: body === undefined ? undefined : JSON.stringify(body) });
async function status(fn: () => unknown) {
	try {
		return ((await fn()) as Response).status;
	} catch (e) {
		return (e as { status: number }).status;
	}
}
const getProgress = async (): Promise<LearnProgress> => (await progress.GET({})).json();
const stateOf = async (id: string) => (await getProgress()).lessons[id]?.state ?? 'new';
const doReset = (id: string, body?: unknown) => reset.POST({ params: { id }, request: req(body) });
const planLessons = async () => {
	const url = new URL('http://x/api/session/plan?minutes=30&date=2026-11-05&tz=0');
	const p = await (await plan.GET({ url })).json();
	return (p.blocks as { target: { type: string; id?: string } }[])
		.filter((b) => b.target.type === 'lesson')
		.map((b) => b.target.id);
};
const skillRows = () =>
	Object.fromEntries(
		db
			.getDb()
			.select()
			.from(schema.skillState)
			.all()
			.map((r) => [r.skillId, r])
	);
/** A lesson further on that teaches a skill no other lesson teaches. */
const futureWithOwnSkill = (): LessonMeta & { own: string } => {
	for (const l of learn.lessons.slice(20)) {
		const own = l.skills.find((s) => learn.lessons.every((o) => o === l || !o.skills.includes(s)));
		if (own) return { ...l, own };
	}
	throw new Error('no fixture');
};

describe('preview vs start', () => {
	it('loading a lesson (opening it) writes nothing and leaves the plan alone', async () => {
		const future = learn.lessons[30];
		const before = await planLessons();
		expect((await lessonApi.GET({ params: { id: future.id } })).status).toBe(200);
		expect(await stateOf(future.id)).toBe('new');
		expect(db.getDb().select().from(schema.lessonProgress).all()).toEqual([]);
		expect(await planLessons()).toEqual(before);
		expect(before).not.toContain(future.id);
		expect((await getProgress()).next?.id).toBe(learn.lessons[0].id);
	});

	it('an exercise attempt sent with its lesson starts it; without one it does not', async () => {
		const l = learn.lessons.find((x) => x.mastery?.type === 'exercise' && x.level >= 2)!;
		const exId = l.mastery?.type === 'exercise' ? l.mastery.id : '';
		const ex = learn.exercises.find((e) => e.id === exId)!;
		await attempts.POST({ params: { id: ex.id }, request: req({ bpm: ex.startBpm, clean: true }) });
		expect(await stateOf(l.id)).toBe('new');
		await attempts.POST({
			params: { id: ex.id },
			request: req({ bpm: ex.startBpm, clean: true, lesson: l.id })
		});
		expect(await stateOf(l.id)).toBe('started');
		// The started lesson is now the one to continue, and the plan's new-skill block.
		expect((await getProgress()).next?.id).toBe(l.id);
		expect(await planLessons()).toContain(l.id);
		// Bad or unknown lesson refs: 400 for a malformed one, ignored when unknown.
		expect(
			await status(() =>
				attempts.POST({
					params: { id: ex.id },
					request: req({ bpm: ex.startBpm, clean: true, lesson: '../x' })
				})
			)
		).toBe(400);
		expect(
			(
				await attempts.POST({
					params: { id: ex.id },
					request: req({ bpm: ex.startBpm, clean: true, lesson: 'no-such-lesson' })
				})
			).status
		).toBe(201);
		core.resetLesson(db.getDb(), 1, l.id);
	});

	it('an ear answer with its lesson starts it; the mastery check starts its lesson', async () => {
		const l = learn.lessons.find((x) => x.mastery?.type === 'ear')!;
		const m = l.mastery?.type === 'ear' ? l.mastery : null;
		await ear.POST({
			request: req({ kind: m!.kind, item: m!.set[0], answer: m!.set[0], lesson: l.id })
		});
		expect(await stateOf(l.id)).toBe('started');
		await doReset(l.id);

		const self = learn.lessons.find((x) => x.mastery?.type === 'self')!;
		const items = self.mastery?.type === 'self' ? self.mastery.items : [];
		await mastery.POST({
			params: { id: self.id },
			request: req({ checked: items.map((_, i) => i) })
		});
		const p = await getProgress();
		expect(p.lessons[self.id].state).toBe('mastered');
		expect(p.lessons[self.id].touched).toEqual(expect.any(Number));
	});

	it('"Start lesson" (PUT started) starts it', async () => {
		const l = learn.lessons[40];
		await lessonApi.PUT({ params: { id: l.id }, request: req({ status: 'started' }, 'PUT') });
		expect(await stateOf(l.id)).toBe('started');
		await doReset(l.id);
	});
});

describe('reset', () => {
	it('takes a lesson back to not started, out of the plan; history stays', async () => {
		const l = learn.lessons.find((x) => x.mastery?.type === 'exercise' && x.level >= 3)!;
		const exId = l.mastery?.type === 'exercise' ? l.mastery.id : '';
		const ex = learn.exercises.find((e) => e.id === exId)!;
		await attempts.POST({
			params: { id: ex.id },
			request: req({ bpm: ex.startBpm, clean: true, lesson: l.id })
		});
		expect(await planLessons()).toContain(l.id);

		const p = (await (await doReset(l.id)).json()) as LearnProgress;
		expect(p.lessons[l.id].state).toBe('new');
		expect(p.next?.id).not.toBe(l.id);
		expect(await planLessons()).not.toContain(l.id);
		// Attempts are kept: the stats still show them.
		expect(p.exercises[ex.id].attempts).toBeGreaterThan(0);
		// Idempotent.
		expect((await doReset(l.id)).status).toBe(200);
	});

	it('validates: unknown lesson 404, a body with fields 400, bad JSON 400', async () => {
		const id = learn.lessons[0].id;
		expect(await status(() => doReset('nope'))).toBe(404);
		expect(await status(() => doReset(id, { all: true }))).toBe(400);
		expect(
			await status(() =>
				reset.POST({
					params: { id },
					request: new Request('http://x', { method: 'POST', body: '{' })
				})
			)
		).toBe(400);
		expect((await doReset(id, {})).status).toBe(200);
	});

	it('re-derives skills: learning only through this lesson goes back to new', async () => {
		const l = futureWithOwnSkill();
		await lessonApi.PUT({ params: { id: l.id }, request: req({ status: 'started' }, 'PUT') });
		expect(skillRows()[l.own]?.status).toBe('learning');
		await doReset(l.id);
		expect(skillRows()[l.own]?.status).toBe('new');
	});

	it('leaves mastered skills (on the review schedule) alone', async () => {
		const self = learn.lessons.find((x) => x.mastery?.type === 'self')!;
		const mastered = self.skills.filter((s) => skillRows()[s]?.status === 'mastered');
		expect(mastered.length).toBeGreaterThan(0);
		await doReset(self.id);
		// A passed check stays passed (its record is history): still mastered, skills too.
		expect(await stateOf(self.id)).toBe('mastered');
		for (const s of mastered) expect(skillRows()[s].status).toBe('mastered');
	});
});

describe('one-time cleanup of lessons started by opening them', () => {
	/** A database migrated up to 0005 (before M7.1), then to the current set. */
	function legacyDb() {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'self-guitar-m71-mig-'));
		const old = path.join(dir, 'drizzle');
		fs.cpSync(path.resolve('drizzle'), old, { recursive: true });
		const journalFile = path.join(old, 'meta/_journal.json');
		const journal = JSON.parse(fs.readFileSync(journalFile, 'utf8'));
		journal.entries = journal.entries.filter((e: { tag: string }) => e.tag < '0006');
		fs.writeFileSync(journalFile, JSON.stringify(journal));
		const file = path.join(dir, 'self-guitar.db');
		process.env.MIGRATIONS_DIR = old;
		try {
			return { file, legacy: db.openDb(file) };
		} finally {
			delete process.env.MIGRATIONS_DIR;
		}
	}

	it('resets only unpractised started lessons, once, and re-derives skills', async () => {
		const { file, legacy } = legacyDb();
		const { lessonProgress, exerciseAttempt, masteryRecord, practiceSession, sessionBlock } =
			schema;
		const exLesson = learn.lessons.find((x) => (x.exercises ?? []).length && x.level >= 2)!;
		const recLesson = learn.lessons.find((x) => x.mastery?.type === 'self' && x.level >= 1)!;
		const browsed = futureWithOwnSkill();
		const blockLesson = learn.lessons.find(
			(x) =>
				x.level >= 4 &&
				![exLesson.id, recLesson.id, browsed.id].includes(x.id) &&
				!(x.exercises ?? []).includes(exLesson.exercises![0])
		)!;
		expect(browsed.exercises ?? []).not.toContain(exLesson.exercises![0]);
		const done = learn.lessons[0];
		const started = [exLesson, recLesson, blockLesson, browsed];
		for (const l of started)
			legacy
				.insert(lessonProgress)
				.values({ profileId: 1, lessonId: l.id, status: 'started' })
				.run();
		legacy
			.insert(lessonProgress)
			.values({ profileId: 1, lessonId: done.id, status: 'completed', completedAt: new Date() })
			.run();
		legacy
			.insert(exerciseAttempt)
			.values({
				profileId: 1,
				exerciseId: exLesson.exercises![0],
				bpm: 60,
				clean: true,
				ladderBpm: 60
			})
			.run();
		legacy
			.insert(masteryRecord)
			.values({ profileId: 1, lessonId: recLesson.id, value: '1/1' })
			.run();
		legacy
			.insert(practiceSession)
			.values({
				id: 's1',
				profileId: 1,
				date: '2026-11-01',
				plannedMin: 15,
				startedAt: new Date(),
				planJson: '{}'
			})
			.run();
		legacy
			.insert(sessionBlock)
			.values({
				sessionId: 's1',
				idx: 0,
				kind: 'new',
				targetJson: JSON.stringify({ type: 'lesson', id: blockLesson.id }),
				plannedMin: 5,
				completed: true
			})
			.run();
		// Planned but skipped: proves nothing.
		legacy
			.insert(sessionBlock)
			.values({
				sessionId: 's1',
				idx: 1,
				kind: 'new',
				targetJson: JSON.stringify({ type: 'lesson', id: browsed.id }),
				plannedMin: 5,
				skipped: true
			})
			.run();
		core.syncSkillStates(legacy, 1, learn);
		const skillOf = (d: typeof legacy, id: string) =>
			d
				.select()
				.from(schema.skillState)
				.all()
				.find((r) => r.skillId === id)?.status;
		expect(skillOf(legacy, browsed.own)).toBe('learning');

		// The migration queues the cleanup (there are started lessons); startup runs it once.
		const migrated = db.openDb(file);
		expect(
			migrated
				.select()
				.from(schema.maintenanceTask)
				.all()
				.map((r) => r.key)
		).toEqual([core.PREVIEW_CLEANUP]);
		expect(core.runMaintenance(migrated, learn)).toEqual([core.PREVIEW_CLEANUP]);
		const rows = Object.fromEntries(
			migrated
				.select()
				.from(lessonProgress)
				.all()
				.map((r) => [r.lessonId, r.status])
		);
		expect(rows).toEqual({
			[exLesson.id]: 'started',
			[recLesson.id]: 'started',
			[blockLesson.id]: 'started',
			[done.id]: 'completed'
		});
		expect(skillOf(migrated, browsed.own)).toBe('new');
		// History untouched.
		expect(migrated.select().from(exerciseAttempt).all()).toHaveLength(1);
		expect(migrated.select().from(sessionBlock).all()).toHaveLength(2);

		// Idempotent: the flag is gone, so a lesson started since (by "Start lesson") stays.
		migrated
			.insert(lessonProgress)
			.values({ profileId: 1, lessonId: browsed.id, status: 'started' })
			.run();
		expect(core.runMaintenance(migrated, learn)).toEqual([]);
		expect(core.runMaintenance(db.openDb(file), learn)).toEqual([]);
		expect(
			migrated
				.select()
				.from(lessonProgress)
				.all()
				.some((r) => r.lessonId === browsed.id)
		).toBe(true);
	});

	it('a new database queues nothing (no write at startup)', () => {
		const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'self-guitar-m71-new-')), 'x.db');
		const fresh = db.openDb(file);
		expect(fresh.select().from(schema.maintenanceTask).all()).toEqual([]);
		expect(core.runMaintenance(fresh, learn)).toEqual([]);
	});

	it('waits for the curriculum: an empty index runs nothing and keeps the task', () => {
		const { file } = legacyDb();
		const d = db.openDb(file);
		d.insert(schema.lessonProgress)
			.values({ profileId: 1, lessonId: learn.lessons[3].id, status: 'started' })
			.run();
		d.insert(schema.maintenanceTask)
			.values({ key: core.PREVIEW_CLEANUP })
			.onConflictDoNothing()
			.run();
		expect(core.runMaintenance(d, { ...learn, lessons: [] })).toEqual([]);
		expect(d.select().from(schema.maintenanceTask).all()).toHaveLength(1);
		expect(core.runMaintenance(d, learn)).toEqual([core.PREVIEW_CLEANUP]);
		expect(d.select().from(schema.lessonProgress).all()).toEqual([]);
	});
});
