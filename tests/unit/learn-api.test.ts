import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { getChord } from '../../src/lib/chords';
import type { Exercise, LearnIndex, Lesson } from '../../src/lib/learn/types';

// Point the app's database at a throwaway directory before any server module loads.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'self-guitar-learn-'));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (event: any) => Response | Promise<Response>;
let index: { GET: Handler };
let progress: { GET: Handler };
let lesson: { PUT: Handler };
let mastery: { POST: Handler };
let attempts: { POST: Handler };
let exercise: { GET: Handler };
let changes: { POST: Handler };
let db: typeof import('../../src/lib/server/db');
let schema: typeof import('../../src/lib/server/db/schema');
let learn: LearnIndex;

beforeAll(async () => {
	index = await import('../../src/routes/api/learn/+server');
	progress = await import('../../src/routes/api/learn/progress/+server');
	lesson = await import('../../src/routes/api/learn/lessons/[id]/+server');
	mastery = await import('../../src/routes/api/learn/lessons/[id]/mastery/+server');
	attempts = await import('../../src/routes/api/exercises/[id]/attempts/+server');
	exercise = await import('../../src/routes/api/exercises/[id]/+server');
	changes = await import('../../src/routes/api/chord-changes/+server');
	db = await import('../../src/lib/server/db');
	schema = await import('../../src/lib/server/db/schema');
	learn = await (await index.GET({})).json();
});

const req = (body: unknown) =>
	new Request('http://x', { method: 'POST', body: JSON.stringify(body) });

async function status(fn: () => unknown) {
	try {
		return ((await fn()) as Response).status;
	} catch (e) {
		return (e as { status: number }).status;
	}
}

const getProgress = async () => (await progress.GET({})).json();
const put = (id: string, s: string) => lesson.PUT({ params: { id }, request: req({ status: s }) });
const attempt = (id: string, bpm: number, clean: boolean) =>
	attempts.POST({ params: { id }, request: req({ bpm, clean }) });
const skillRows = () =>
	Object.fromEntries(
		db
			.getDb()
			.select()
			.from(schema.skillState)
			.all()
			.map((r) => [r.skillId, r])
	);

// Fixtures looked up by role, not by name, so content edits don't break the tests.
const first = () => learn.lessons[0];
const byMastery = (type: string) => learn.lessons.find((l) => l.mastery?.type === type)!;
const exerciseLesson = () => byMastery('exercise') as Lesson & { mastery: { id: string } };
const exerciseOf = (l: Lesson) =>
	learn.exercises.find((e) => l.mastery?.type === 'exercise' && e.id === l.mastery.id)!;

describe('learn API', () => {
	it('serves the compiled curriculum', () => {
		expect(learn.levels).toHaveLength(10);
		expect(first().level).toBe(0);
		expect(learn.exercises.length).toBeGreaterThan(0);
	});

	it('starts with everything new and recommends the first lesson', async () => {
		const p = await getProgress();
		expect(p.next).toMatchObject({ id: first().id });
		const ex: Exercise = learn.exercises[0];
		expect(p.exercises[ex.id]).toEqual({
			best: null,
			streakBest: null,
			resumeBpm: ex.startBpm,
			attempts: 0,
			mastered: false
		});
		// Reads never write skill_state.
		expect(Object.keys(skillRows())).toEqual([]);
	});

	it('marks lessons started then completed, never back to started', async () => {
		const id = first().id;
		let p = await (await put(id, 'started')).json();
		expect(p.lessons[id].state).toBe('started');
		expect(p.lessons[id].touched).toEqual(expect.any(Number));
		p = await (await put(id, 'completed')).json();
		expect(['completed', 'mastered']).toContain(p.lessons[id].state);
		p = await (await put(id, 'started')).json();
		expect(p.lessons[id].state).not.toBe('started');
		expect(p.next.id).not.toBe(id);

		expect(await status(() => put('nope', 'started'))).toBe(404);
		expect(await status(() => put(id, 'done'))).toBe(400);
		expect(
			await status(() =>
				lesson.PUT({
					params: { id },
					request: new Request('http://x', { method: 'PUT', body: '{' })
				})
			)
		).toBe(400);
	});

	it('syncs skill_state on writes', async () => {
		const skill = first().skills[0];
		expect(skillRows()[skill]?.status).toMatch(/learning|mastered/);
	});

	it('confirms self checks only with every item ticked; mastered_at is the record time', async () => {
		const l = byMastery('self');
		const items = l.mastery?.type === 'self' ? l.mastery.items : [];
		const post = (id: string, body: unknown) =>
			mastery.POST({ params: { id }, request: req(body) });
		expect(await status(() => post(l.id, { checked: [] }))).toBe(400);
		expect(await status(() => post(l.id, { checked: 'all' }))).toBe(400);
		expect(await status(() => post(exerciseLesson().id, {}))).toBe(400); // exercise check
		await put(l.id, 'started');
		const p = await (await post(l.id, { checked: items.map((_, i) => i) })).json();
		expect(p.lessons[l.id].state).toBe('mastered');

		// A skill only this lesson teaches is mastered, stamped with the record's created_at.
		const only = l.skills.find((s) => learn.lessons.every((o) => o === l || !o.skills.includes(s)));
		if (only) {
			const record = db.getDb().select().from(schema.masteryRecord).all().at(-1)!;
			const row = skillRows()[only];
			expect(row.status).toBe('mastered');
			expect(row.masteredAt?.getTime()).toBe(record.createdAt.getTime());
			// Later records keep the first mastered_at.
			await new Promise((r) => setTimeout(r, 1100));
			await post(l.id, { checked: items.map((_, i) => i) });
			expect(skillRows()[only].masteredAt?.getTime()).toBe(record.createdAt.getTime());
		}
		expect((await post(byMastery('tuner').id, {})).status).toBe(201);
	});

	it('never overwrites a skill row the review scheduler owns (due_at set)', async () => {
		const l = byMastery('tuner');
		const skill = l.skills[0];
		const due = new Date(Date.now() + 86_400_000);
		db.getDb()
			.insert(schema.skillState)
			.values({ profileId: 1, skillId: skill, status: 'learning', dueAt: due, ease: 2.5 })
			.onConflictDoUpdate({
				target: [schema.skillState.profileId, schema.skillState.skillId],
				set: { status: 'learning', dueAt: due, ease: 2.5 }
			})
			.run();
		await put(l.id, 'completed');
		expect(skillRows()[skill]).toMatchObject({ status: 'learning', ease: 2.5 });
	});

	it('validates attempt tempos against the exercise ladder', async () => {
		const ex = exerciseOf(exerciseLesson());
		expect(await status(() => attempt('nope', 60, true))).toBe(404);
		expect(await status(() => attempt(ex.id, 10, true))).toBe(400);
		expect(await status(() => attempt(ex.id, ex.startBpm - 4 * ex.step, true))).toBe(400);
		expect(await status(() => attempt(ex.id, ex.targetBpm + 3 * ex.step, true))).toBe(400);
		expect(
			await status(() =>
				attempts.POST({ params: { id: ex.id }, request: req({ bpm: ex.startBpm }) })
			)
		).toBe(400);
	});

	it('stores the ladder position and masters only with a clean streak at the target', async () => {
		const l = exerciseLesson();
		const ex = exerciseOf(l);
		const at = async (bpm: number, clean: boolean) => (await attempt(ex.id, bpm, clean)).json();

		let d = await at(ex.startBpm, true);
		expect(d).toMatchObject({ resumeBpm: ex.startBpm, streak: 1, misses: 0, best: ex.startBpm });
		// One miss resets the streak, two in a row step down (never below start).
		d = await at(ex.startBpm, false);
		expect(d).toMatchObject({ resumeBpm: ex.startBpm, streak: 0, misses: 1 });
		for (let i = 0; i < ex.cleanReps; i++) d = await at(ex.startBpm, true);
		expect(d).toMatchObject({ resumeBpm: ex.startBpm + ex.step, streak: 0, misses: 0 });
		expect(d.streakBest).toBe(ex.startBpm);
		// Resumes there after a reload.
		const fresh = await (await exercise.GET({ params: { id: ex.id } })).json();
		expect(fresh).toMatchObject({ resumeBpm: ex.startBpm + ex.step, streak: 0 });

		// One clean pass at the target is not mastery.
		d = await at(ex.targetBpm, true);
		expect(d.mastered).toBe(false);
		let p = await getProgress();
		expect(p.lessons[l.id].mastery).toMatchObject({ done: false, value: ex.targetBpm });
		for (let i = 1; i < ex.cleanReps; i++) d = await at(ex.targetBpm, true);
		expect(d.mastered).toBe(true);
		p = await getProgress();
		expect(p.lessons[l.id].state).toBe('mastered');
		expect(p.exercises[ex.id]).toMatchObject({ mastered: true, streakBest: ex.targetBpm });
		const masteredRow = db
			.getDb()
			.select()
			.from(schema.exerciseAttempt)
			.all()
			.filter((r) => r.mastered);
		expect(masteredRow).toHaveLength(1);
	});

	it('counts 1-minute-changes records toward changes checks and syncs skills', async () => {
		const l = byMastery('changes');
		if (!l || l.mastery?.type !== 'changes') return;
		const { a, b, target } = l.mastery;
		const res = await changes.POST({
			request: req({ chordA: getChord(a)!.id, chordB: getChord(b)!.id, count: target })
		});
		expect(res.status).toBe(201);
		const p = await getProgress();
		expect(p.lessons[l.id].mastery).toMatchObject({ done: true, value: target, target });
		const only = l.skills.find((s) => learn.lessons.every((o) => o === l || !o.skills.includes(s)));
		if (only) expect(skillRows()[only]?.status).toBe('mastered');
	});
});
