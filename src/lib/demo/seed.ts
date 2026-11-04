// "Load sample progress" on the demo: a learner who has mastered Levels 0–3 and is into Level 4
// (its first fretboard and ear checks passed), with ear-training and fretboard-quiz history and
// two weeks of sessions. Built through the same API calls the app makes (so every rule applies), then the
// timestamps are spread over the past weeks so the charts and the review schedule look lived-in.
import { sql } from 'drizzle-orm';
import { practiceSession } from '$lib/core/db/schema';
import type { LearnIndex, LearnProgress, ExerciseDetail } from '$lib/learn/types';
import { addDays, clientTz } from '$lib/session/time';
import { localDate, type Plan, type StoredSession } from '$lib/session/types';
import { atomically, demoDb } from './db';
import { handle } from './shim';
import type { EarKind } from '$lib/ear/items';
import { quizSpec } from '$lib/fretboard/quiz';

const DAY_S = 86_400;
/** Levels mastered in full; the next one is under way. */
const LEVELS_DONE = 3;
/** Level 4 lessons done: its fretboard and ear checks and its reading lessons. */
const LEVEL4_DONE = new Set(['fretboard', 'ear', 'self']);
/** Days ago with a practice session. */
const SESSION_DAYS = [15, 13, 12, 10, 9, 8, 6, 5, 4, 3, 2, 1];

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
	const res = await handle(
		path,
		body === undefined
			? { method }
			: { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
	);
	if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
	return (await res.json()) as T;
}

async function masterExercise(id: string, bpm: number, tz: string | number) {
	const path = `/api/exercises/${encodeURIComponent(id)}`;
	let d = await call<ExerciseDetail>(path);
	for (let i = 0; i < 150 && !d.mastered && (d.best ?? 0) < bpm; i++) {
		// An occasional miss, like a real ladder run.
		const clean = i % 7 !== 3;
		d = await call<ExerciseDetail>(`${path}/attempts`, 'POST', { bpm: d.resumeBpm, clean, tz });
	}
}

/** `n` answers over `set`, mostly right (every 7th answer mistakes the item for its neighbour). */
async function earAnswers(kind: EarKind, set: string[], n: number, tz: string | number) {
	for (let i = 0; i < n; i++) {
		const item = set[i % set.length];
		const answer = i % 7 === 5 ? set[(i + 1) % set.length] : item;
		await call('/api/ear', 'POST', { kind, item, answer, tz });
	}
}

/** One passing round of a fretboard quiz in `ms`. */
async function fretRound(quiz: string, ms: number, tz: string | number) {
	const spec = quizSpec(quiz);
	const found = spec.fixed ? 6 : spec.prompts * spec.strings.length;
	await call('/api/fretboard', 'POST', { quiz, found, wrong: 0, ms: Math.round(ms), tz });
}

/**
 * Fills the demo with sample progress; false (and no change) when it already has sessions. All
 * or nothing: a failure part-way rolls every write back.
 */
export async function loadSampleProgress(): Promise<boolean> {
	const db = await demoDb();
	if (db.select().from(practiceSession).limit(1).all().length) return false;
	await atomically(() => seed(db));
	return true;
}

async function seed(db: Awaited<ReturnType<typeof demoDb>>) {
	const tz = clientTz();
	const learn = await call<LearnIndex>('/api/learn');
	const next = learn.lessons.find(
		(l) => l.level === LEVELS_DONE + 1 && l.mastery?.type === 'exercise'
	);
	const lessons = [
		...learn.lessons.filter((l) => l.level <= LEVELS_DONE),
		...learn.lessons.filter(
			(l) => l.level === LEVELS_DONE + 1 && LEVEL4_DONE.has(l.mastery?.type ?? '')
		),
		...(next ? [next] : [])
	];
	const progress = await call<LearnProgress>('/api/learn/progress');

	for (const [i, lesson] of lessons.entries()) {
		if (progress.lessons[lesson.id]?.state === 'completed') continue;
		const enc = encodeURIComponent(lesson.id);
		await call(`/api/learn/lessons/${enc}`, 'PUT', { status: 'started' });
		// The last one stays in progress: Today suggests it next.
		if (i === lessons.length - 1) break;
		const m = lesson.mastery;
		if (m?.type === 'self')
			await call(`/api/learn/lessons/${enc}/mastery`, 'POST', {
				checked: m.items.map((_, j) => j)
			});
		else if (m?.type === 'tuner') await call(`/api/learn/lessons/${enc}/mastery`, 'POST', {});
		else if (m?.type === 'exercise') await masterExercise(m.id, m.bpm, tz);
		else if (m?.type === 'ear') await earAnswers(m.kind, m.set, m.min + 6, tz);
		else if (m?.type === 'fretboard')
			for (const ms of [m.target * 1900, m.target * 1300, m.target * 950])
				await fretRound(m.quiz, ms, tz);
		else if (m?.type === 'changes') {
			// A few tries, improving up to the goal.
			for (const count of [m.target - 12, m.target - 7, m.target - 3, m.target + 1])
				await call('/api/chord-changes', 'POST', { chordA: m.a, chordB: m.b, count, tz });
		}
		await call(`/api/learn/lessons/${enc}`, 'PUT', { status: 'completed' });
	}

	// More ear and fretboard practice: intervals (one confusion), and rounds of the wider quizzes.
	await earAnswers('intervals', ['P4', 'P5', 'P8'], 24, tz);
	await earAnswers('chords', ['major', 'minor'], 10, tz);
	for (const [quiz, ms] of [
		['string-5', 34_000],
		['strings-6-5', 52_000],
		['string-6', 24_000]
	] as const)
		await fretRound(quiz, ms, tz);

	// Spread what was just recorded over the three weeks before the sessions below: older rows
	// further back, in the order they were made.
	const spread = (table: string, column: string) =>
		db.run(
			sql.raw(
				`UPDATE ${table} SET ${column} = ${column} - ${7 * DAY_S} - ` +
					`((SELECT max(rowid) FROM ${table}) - rowid) * ${14 * DAY_S} / ` +
					`max(1, (SELECT count(*) FROM ${table})) WHERE ${column} IS NOT NULL`
			)
		);
	spread('exercise_attempt', 'created_at');
	spread('chord_change_record', 'created_at');
	spread('mastery_record', 'created_at');
	spread('ear_result', 'created_at');
	spread('fretboard_result', 'created_at');
	spread('lesson_progress', 'completed_at');
	spread('lesson_progress', 'updated_at');
	// Skills learned a while ago come up for review: some are due now, others in a few days.
	db.run(
		sql.raw(
			`UPDATE skill_state SET mastered_at = mastered_at - ${10 * DAY_S} - (rowid % 5) * ${DAY_S}, ` +
				`due_at = mastered_at + ((rowid % 6) - 2) * ${DAY_S} WHERE mastered_at IS NOT NULL`
		)
	);

	// Two weeks of short daily sessions, each the plan the app proposed that day.
	const today = localDate();
	for (const ago of SESSION_DAYS) {
		const date = addDays(today, -ago);
		const minutes = ago % 3 === 0 ? 20 : 15;
		const plan = await call<Plan>(
			`/api/session/plan?minutes=${minutes}&date=${date}&tz=${encodeURIComponent(String(tz))}`
		);
		const [y, mo, d] = date.split('-').map(Number);
		const startedAt = new Date(y, mo - 1, d, 18, 30).getTime();
		const s = await call<StoredSession>('/api/session', 'POST', {
			id: crypto.randomUUID(),
			date,
			tz,
			minutes,
			blocks: plan.blocks,
			startedAt
		});
		let at = startedAt;
		for (const [idx, b] of s.blocks.entries()) {
			const skipped = ago === 9 && idx === s.blocks.length - 1;
			const actualSec = skipped ? 0 : b.minutes * 60 + (idx % 2) * 15;
			at += actualSec * 1000;
			await call(`/api/session/${s.id}/blocks/${idx}`, 'PUT', {
				actualSec,
				completed: !skipped,
				skipped,
				rating: skipped ? null : (['ok', 'great', 'ok', 'hard'] as const)[(idx + ago) % 4],
				tz
			});
		}
		await call(`/api/session/${s.id}/end`, 'POST', { endedAt: at, tz });
	}

	// Songs played recently: "Continue" on Today.
	for (const [i, id] of ['drunken-sailor', 'scarborough-fair'].entries()) {
		if (!(await handle(`/api/songs/${id}`)).ok) continue;
		await call(`/api/songs/${id}/progress`, 'PUT', {
			tempoPct: 80 - i * 10,
			loopStartBar: null,
			loopEndBar: null,
			played: true
		});
	}
}
