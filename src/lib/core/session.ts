// Today (M4): gathers the planner's inputs, stores sessions and block results, feeds ratings to
// the review schedule, and serves the weekly goal and the history charts.
import { and, asc, desc, eq, gte, isNull, lt, max, min, sql } from 'drizzle-orm';
import { z } from 'zod';
import { chordRef, getChord } from '$lib/chords';
import { canonicalPair, lessonPairKey, pairKey } from '$lib/chordChanges';
import { isDue, lastReviewed } from '$lib/learn/review';
import { skillName } from '$lib/learn/tree';
import type { LearnIndex, LessonState } from '$lib/learn/types';
import { weeklyGoals, weekStatus, weekStart } from '$lib/session/goals';
import {
	CHANGES_GOAL,
	isStalled,
	planSession,
	RECENT_ATTEMPTS,
	RECENT_DAYS,
	type ExerciseSignal,
	type PlanState,
	type RecentSession
} from '$lib/session/planner';
import { addDays, dueBy, localDay, startOfDay, type Tz } from '$lib/session/time';
import {
	BLOCK_KINDS,
	DEFAULT_SETTINGS,
	MAX_SESSION,
	MIN_SESSION,
	RATINGS,
	type BlockResult,
	type Plan,
	type PlanBlock,
	type SessionSummary,
	type Settings,
	type StoredSession
} from '$lib/session/types';
import { TEMPO_MAX, TEMPO_MIN } from '$lib/progress';
import { EAR_KINDS, isEarItem } from '$lib/ear/items';
import { isQuiz } from '$lib/fretboard/quiz';
import type { Db } from './db';
import {
	chordChangeRecord,
	exerciseAttempt,
	practiceSession,
	profileSettings,
	sessionBlock
} from './db/schema';
import { listChangePairs } from './chordChanges';
import { applyReview, getLearnProgress, storedSkills } from './learn';
import { listProgress } from './progress';
import { getSongSummary, listSongs } from './content';
import { dateSchema, tzSchema } from './validate';

// ---- validation ----------------------------------------------------------------------------------

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const date = dateSchema;
const tz = tzSchema;
/** Planned minutes may run over the session length by this much (rounding in old plans). */
const PLAN_SLACK = 2;
const minutes = z.number().int().min(MIN_SESSION).max(MAX_SESSION);
const chord = z.string().refine((c) => !!getChord(c), 'unknown chord');

const targetSchema = z.discriminatedUnion('type', [
	z.strictObject({ type: z.literal('lesson'), id: slug }),
	z.strictObject({ type: z.literal('exercise'), id: slug }),
	z.strictObject({
		type: z.literal('changes'),
		a: chord,
		b: chord,
		target: z.number().int().min(1).max(300)
	}),
	z.strictObject({
		type: z.literal('song'),
		id: slug,
		tempoPct: z.number().int().min(TEMPO_MIN).max(TEMPO_MAX),
		loop: z
			.strictObject({ start: z.number().int().min(0), end: z.number().int().min(0) })
			.refine((l) => l.start <= l.end, 'loop start must be <= end')
			.nullable(),
		play: z.enum(['melody', 'chords', 'fingerstyle']).optional()
	}),
	z.strictObject({
		type: z.literal('tool'),
		id: z.enum(['tuner', 'metronome']),
		params: z.record(z.string().max(20), z.string().max(20))
	}),
	z.strictObject({
		type: z.literal('strum'),
		pattern: z.string().regex(/^[DU-]{4,32}$/),
		bpm: z.number().int().min(30).max(240),
		chord: z
			.string()
			.refine((c) => !!chordRef(c), 'unknown chord')
			.nullable(),
		sub: z.literal(16).optional(),
		ts: z.literal('6/8').optional()
	}),
	z.strictObject({ type: z.literal('warmup'), id: slug }),
	z.strictObject({
		type: z.literal('ear'),
		kind: z.enum(EAR_KINDS),
		set: z.array(z.string().max(12)).min(1).max(12)
	}),
	z.strictObject({
		type: z.literal('fretboard'),
		quiz: z.string().refine(isQuiz, 'unknown quiz'),
		target: z.number().int().min(5).max(600).optional()
	})
]);

export const blockSchema = z.strictObject({
	kind: z.enum(BLOCK_KINDS),
	title: z.string().min(1).max(120),
	minutes: z.number().int().min(1).max(MAX_SESSION),
	target: targetSchema,
	why: z.string().max(200),
	skills: z.array(slug).max(20).optional()
});

export const planQuerySchema = z.strictObject({
	minutes: minutes.default(15),
	date,
	tz: tz.optional()
});

export const startInputSchema = z
	.strictObject({
		id: z.string().uuid(),
		date,
		tz: tz.optional(),
		minutes,
		/** The previewed plan (what the learner saw); planned on the server when omitted. */
		blocks: z.array(blockSchema).min(1).max(12).optional(),
		startedAt: z.number().int().positive().optional()
	})
	.refine(
		(s) => !s.blocks || s.blocks.reduce((a, b) => a + b.minutes, 0) <= s.minutes + PLAN_SLACK,
		{
			message: 'blocks add up to more than the session length'
		}
	);

export const blockResultSchema = z.strictObject({
	actualSec: z
		.number()
		.int()
		.min(0)
		.max(4 * 3600),
	rating: z.enum(RATINGS).nullable().default(null),
	bpm: z.number().int().min(20).max(300).nullable().default(null),
	completed: z.boolean(),
	skipped: z.boolean().default(false),
	tz: tz.optional()
});

export const endInputSchema = z.strictObject({
	endedAt: z.number().int().positive().optional(),
	tz: tz.optional()
});

export const settingsSchema = z.strictObject({
	weeklyDays: z.number().int().min(1).max(7),
	dailyMin: z.number().int().min(5).max(60),
	sessionMin: minutes
});

/** Search params as an object (numbers for `numeric` keys) for the GET schemas (400 on junk). */
export function queryObject(url: URL, numeric: string[]) {
	const out: Record<string, unknown> = {};
	for (const [k, v] of url.searchParams) out[k] = numeric.includes(k) && v !== '' ? Number(v) : v;
	return out;
}

/** Problem with a block's target against the content (unknown lesson, song, exercise), or null. */
export function targetProblem(b: PlanBlock, index: LearnIndex): string | null {
	const t = b.target;
	if (t.type === 'lesson' && !index.lessons.some((l) => l.id === t.id)) return 'unknown lesson';
	if (t.type === 'exercise' && !index.exercises.some((e) => e.id === t.id))
		return 'unknown exercise';
	if (t.type === 'warmup' && !index.warmups.some((w) => w.id === t.id)) return 'unknown warm-up';
	if (t.type === 'song') {
		const song = getSongSummary(t.id);
		if (!song) return 'unknown song';
		if (t.loop && t.loop.end >= song.bars) return 'loop outside the song';
	}
	if (t.type === 'changes' && getChord(t.a)?.id === getChord(t.b)?.id)
		return 'pick two different chords';
	if (t.type === 'ear' && t.set.some((i) => !isEarItem(t.kind, i))) return 'unknown ear item';
	return null;
}

// ---- planner inputs ------------------------------------------------------------------------------

/** The last RECENT_ATTEMPTS passes of every exercise, newest first (one windowed query). */
function recentAttempts(db: Db, profileId: number) {
	const rows = db.all<{ id: string; clean: number; ladderBpm: number; at: number }>(sql`
		SELECT exercise_id AS id, clean, ladder_bpm AS ladderBpm, created_at AS at FROM (
			SELECT *, row_number() OVER (PARTITION BY exercise_id ORDER BY id DESC) AS rn
			FROM exercise_attempt WHERE profile_id = ${profileId}
		) WHERE rn <= ${RECENT_ATTEMPTS} ORDER BY id DESC`);
	const byEx = new Map<string, typeof rows>();
	for (const r of rows) byEx.set(r.id, [...(byEx.get(r.id) ?? []), r]);
	return byEx;
}

function exerciseSignals(
	db: Db,
	profileId: number,
	stats: ReturnType<typeof getLearnProgress>['exercises']
): Record<string, ExerciseSignal> {
	const byEx = recentAttempts(db, profileId);
	const out: Record<string, ExerciseSignal> = {};
	for (const [id, s] of Object.entries(stats)) {
		const recent = byEx.get(id) ?? [];
		out[id] = {
			attempts: s.attempts,
			mastered: s.mastered,
			best: s.best,
			ladderBpm: s.resumeBpm,
			recentClean: recent.filter((r) => r.clean).length,
			recentTotal: recent.length,
			stalled: isStalled(
				s.mastered,
				recent.map((r) => r.ladderBpm)
			),
			lastAt: recent.length ? recent[0].at * 1000 : null
		};
	}
	return out;
}

/** Sessions of the past week (RECENT_DAYS before `date`), newest first. */
function recentSessions(db: Db, profileId: number, date: string): RecentSession[] {
	return db
		.select({ date: practiceSession.date, plan: practiceSession.planJson })
		.from(practiceSession)
		.where(
			and(
				eq(practiceSession.profileId, profileId),
				gte(practiceSession.date, addDays(date, -RECENT_DAYS))
			)
		)
		.orderBy(desc(practiceSession.startedAt))
		.limit(50)
		.all()
		.map((s) => ({ date: s.date, blocks: (JSON.parse(s.plan) as PlanBlock[]) ?? [] }));
}

export function planState(
	db: Db,
	profileId: number,
	index: LearnIndex,
	opts: { minutes: number; date: string; tz?: Tz; now?: number }
): PlanState {
	const now = opts.now ?? Date.now();
	const progress = getLearnProgress(db, profileId, index);
	const lessonStates: Record<string, LessonState> = {};
	for (const [id, l] of Object.entries(progress.lessons)) lessonStates[id] = l.state;
	const songProgress = new Map(listProgress(db, profileId).map((p) => [p.songId, p]));
	return {
		minutes: opts.minutes,
		date: opts.date,
		now,
		dueBy: dueBy(opts.date, opts.tz, now),
		index,
		lessonStates,
		next: progress.next?.id ?? null,
		skills: [...storedSkills(db, profileId).values()].map((s) => ({
			id: s.skillId,
			status: s.status,
			dueAt: s.dueAt,
			ease: s.ease
		})),
		exercises: exerciseSignals(db, profileId, progress.exercises),
		pairs: listChangePairs(db, profileId).map((p) => ({
			a: p.chordA,
			b: p.chordB,
			best: p.best,
			lastAt: p.history.length ? Date.parse(p.history[p.history.length - 1].createdAt) : null
		})),
		songs: listSongs().map((s) => {
			const p = songProgress.get(s.id);
			return {
				id: s.id,
				title: s.title,
				level: s.level,
				bars: s.bars,
				pickup: s.pickup,
				play: s.play,
				lastPlayedAt: p?.lastPlayedAt ? Date.parse(p.lastPlayedAt) : null,
				maxTempoPct: p?.maxPlayedTempoPct ?? null,
				loop:
					p && p.loopStartBar !== null && p.loopEndBar !== null
						? { start: p.loopStartBar, end: p.loopEndBar }
						: null
			};
		}),
		recent: recentSessions(db, profileId, opts.date)
	};
}

export function getPlan(
	db: Db,
	profileId: number,
	index: LearnIndex,
	opts: { minutes: number; date: string; tz?: Tz; now?: number }
): Plan {
	return planSession(planState(db, profileId, index, opts));
}

// ---- sessions ------------------------------------------------------------------------------------

function toStored(
	s: typeof practiceSession.$inferSelect,
	rows: (typeof sessionBlock.$inferSelect)[]
): StoredSession {
	const blocks = JSON.parse(s.planJson) as PlanBlock[];
	return {
		id: s.id,
		date: s.date,
		plannedMin: s.plannedMin,
		startedAt: s.startedAt.getTime(),
		endedAt: s.endedAt?.getTime() ?? null,
		blocks,
		results: blocks.map((_, i) => {
			const r = rows.find((b) => b.idx === i);
			return r && (r.completed || r.skipped)
				? {
						actualSec: r.actualSec,
						rating: r.rating,
						bpm: r.bpm,
						completed: r.completed,
						skipped: r.skipped
					}
				: null;
		})
	};
}

export function getSession(db: Db, profileId: number, id: string): StoredSession | null {
	const s = db
		.select()
		.from(practiceSession)
		.where(and(eq(practiceSession.id, id), eq(practiceSession.profileId, profileId)))
		.get();
	if (!s) return null;
	const rows = db.select().from(sessionBlock).where(eq(sessionBlock.sessionId, id)).all();
	return toStored(s, rows);
}

/** The latest session of a local day (Today's "done for today" recap). */
export function sessionOfDay(db: Db, profileId: number, day: string): StoredSession | null {
	const s = db
		.select({ id: practiceSession.id })
		.from(practiceSession)
		.where(and(eq(practiceSession.profileId, profileId), eq(practiceSession.date, day)))
		.orderBy(desc(practiceSession.startedAt))
		.get();
	return s ? getSession(db, profileId, s.id) : null;
}

/** Sessions left open longer than this are over (ended at their last activity). */
export const STALE_MS = 6 * 3600_000;

/** The session in progress (not ended, started recently), to resume it on another device. */
export function openSession(db: Db, profileId: number, now = Date.now()): StoredSession | null {
	const s = db
		.select({ id: practiceSession.id })
		.from(practiceSession)
		.where(
			and(
				eq(practiceSession.profileId, profileId),
				isNull(practiceSession.endedAt),
				gte(practiceSession.startedAt, new Date(now - STALE_MS))
			)
		)
		.orderBy(desc(practiceSession.startedAt))
		.get();
	return s ? getSession(db, profileId, s.id) : null;
}

/** Thrown when a session id belongs to another profile (a 409). */
export class SessionConflict extends Error {}

/**
 * Starts a session (idempotent by id: a retried start returns the stored one). Sessions left
 * open before it are ended at their last activity (start + the time played).
 */
export function startSession(
	db: Db,
	profileId: number,
	input: { id: string; date: string; minutes: number; blocks: PlanBlock[]; startedAt?: number }
): StoredSession {
	const owner = db
		.select({ profileId: practiceSession.profileId })
		.from(practiceSession)
		.where(eq(practiceSession.id, input.id))
		.get();
	if (owner && owner.profileId !== profileId) throw new SessionConflict('session id in use');
	if (owner) return getSession(db, profileId, input.id)!;
	db.transaction((tx) => {
		tx.run(sql`
			UPDATE practice_session SET ended_at = started_at + coalesce(
				(SELECT sum(actual_sec) FROM session_block b WHERE b.session_id = practice_session.id), 0)
			WHERE profile_id = ${profileId} AND ended_at IS NULL`);
		tx.insert(practiceSession)
			.values({
				id: input.id,
				profileId,
				date: input.date,
				plannedMin: input.minutes,
				startedAt: new Date(input.startedAt ?? Date.now()),
				planJson: JSON.stringify(input.blocks)
			})
			.run();
		input.blocks.forEach((b, idx) =>
			tx
				.insert(sessionBlock)
				.values({
					sessionId: input.id,
					idx,
					kind: b.kind,
					targetJson: JSON.stringify(b.target),
					plannedMin: b.minutes
				})
				.run()
		);
	});
	return getSession(db, profileId, input.id)!;
}

/**
 * Stores a block's result and feeds the review schedule (through $lib/learn/review): a rated
 * block moves its skills (😎/🙂 advance, 😖 lapses); "clean at BPM" at or above an exercise's
 * target is a good review of the exercise's skills. A retried result changes nothing more.
 * `due` is the end of the learner's day (dueBy).
 */
export function completeBlock(
	db: Db,
	profileId: number,
	sessionId: string,
	idx: number,
	result: BlockResult,
	index: LearnIndex,
	due: number
): StoredSession | null {
	const session = getSession(db, profileId, sessionId);
	if (!session || idx >= session.blocks.length) return null;
	const already = session.results[idx];
	db.update(sessionBlock)
		.set({
			actualSec: result.actualSec,
			rating: result.rating,
			bpm: result.bpm,
			completed: result.completed,
			skipped: result.skipped && !result.completed
		})
		.where(and(eq(sessionBlock.sessionId, sessionId), eq(sessionBlock.idx, idx)))
		.run();
	const total = db
		.select({ sec: sql<number>`coalesce(sum(${sessionBlock.actualSec}), 0)` })
		.from(sessionBlock)
		.where(eq(sessionBlock.sessionId, sessionId))
		.get();
	db.update(practiceSession)
		.set({ actualMin: Math.round((total?.sec ?? 0) / 60) })
		.where(eq(practiceSession.id, sessionId))
		.run();

	if (!already && result.completed && result.rating) {
		const block = session.blocks[idx];
		const now = Date.now();
		const good = result.rating !== 'hard';
		if (block.skills?.length) applyReview(db, profileId, block.skills, good, now, due);
		const t = block.target;
		if (t.type === 'exercise' && good && result.bpm) {
			const ex = index.exercises.find((e) => e.id === t.id);
			if (ex && result.bpm >= ex.targetBpm) applyReview(db, profileId, ex.skills, true, now, due);
		}
	}
	return getSession(db, profileId, sessionId);
}

/**
 * Ends a session (keeps the first end time) and returns its summary; 'early' when the end time
 * is before the start.
 */
export function endSession(
	db: Db,
	profileId: number,
	sessionId: string,
	index: LearnIndex,
	opts: { endedAt?: number; tz?: Tz } = {}
): SessionSummary | null | 'early' {
	const session = getSession(db, profileId, sessionId);
	if (!session) return null;
	if (opts.endedAt !== undefined && opts.endedAt < session.startedAt) return 'early';
	if (!session.endedAt)
		db.update(practiceSession)
			.set({ endedAt: new Date(opts.endedAt ?? Date.now()) })
			.where(eq(practiceSession.id, sessionId))
			.run();
	return summary(db, profileId, getSession(db, profileId, sessionId)!, index, opts.tz);
}

const secs = (ms: number) => new Date(Math.floor(ms / 1000) * 1000);

export function summary(
	db: Db,
	profileId: number,
	s: StoredSession,
	index: LearnIndex,
	tz: Tz = 0
): SessionSummary {
	const from = secs(s.startedAt);
	// Writes queued offline arrive after the end time: count everything up to now.
	const to = new Date(Math.max(s.endedAt ?? 0, Date.now()) + 1000);
	const pbs: SessionSummary['pbs'] = [];

	// ExerciseMeta PBs: best clean BPM in the session above the best before it.
	const during = db
		.select({ id: exerciseAttempt.exerciseId, best: max(exerciseAttempt.bpm) })
		.from(exerciseAttempt)
		.where(
			and(
				eq(exerciseAttempt.profileId, profileId),
				eq(exerciseAttempt.clean, true),
				gte(exerciseAttempt.createdAt, from),
				lt(exerciseAttempt.createdAt, to)
			)
		)
		.groupBy(exerciseAttempt.exerciseId)
		.all();
	for (const d of during) {
		const before = db
			.select({ best: max(exerciseAttempt.bpm) })
			.from(exerciseAttempt)
			.where(
				and(
					eq(exerciseAttempt.profileId, profileId),
					eq(exerciseAttempt.exerciseId, d.id),
					eq(exerciseAttempt.clean, true),
					lt(exerciseAttempt.createdAt, from)
				)
			)
			.get();
		if (d.best !== null && d.best > (before?.best ?? 0)) {
			const ex = index.exercises.find((e) => e.id === d.id);
			pbs.push({ label: ex?.title ?? d.id, value: `${d.best} BPM clean` });
		}
	}

	// Changes PBs.
	const pairs = db
		.select({
			a: chordChangeRecord.chordA,
			b: chordChangeRecord.chordB,
			best: max(chordChangeRecord.count)
		})
		.from(chordChangeRecord)
		.where(
			and(
				eq(chordChangeRecord.profileId, profileId),
				gte(chordChangeRecord.createdAt, from),
				lt(chordChangeRecord.createdAt, to)
			)
		)
		.groupBy(chordChangeRecord.chordA, chordChangeRecord.chordB)
		.all();
	for (const p of pairs) {
		const before = db
			.select({ best: max(chordChangeRecord.count) })
			.from(chordChangeRecord)
			.where(
				and(
					eq(chordChangeRecord.profileId, profileId),
					eq(chordChangeRecord.chordA, p.a),
					eq(chordChangeRecord.chordB, p.b),
					lt(chordChangeRecord.createdAt, from)
				)
			)
			.get();
		if (p.best !== null && p.best > (before?.best ?? 0))
			pbs.push({ label: `${p.a} – ${p.b} changes`, value: `${p.best} / min` });
	}

	// Skills whose schedule moved during the session (rated blocks, ladder or changes mastery):
	// their last review falls inside it.
	const skills = storedSkills(db, profileId);
	const reviewed: SessionSummary['reviewed'] = [];
	for (const row of skills.values()) {
		const last = lastReviewed(row);
		if (row.dueAt === null || last === null || last < from.getTime() - 1000 || last > to.getTime())
			continue;
		reviewed.push({
			skillId: row.skillId,
			name: skillName(index, row.skillId),
			dueAt: row.dueAt,
			lapsed: row.status !== 'mastered'
		});
	}
	reviewed.sort((a, b) => a.dueAt - b.dueAt);

	// Tomorrow: what will be due by its end, and the next lesson.
	const tomorrowEnd = dueBy(addDays(s.date, 1), tz);
	const progress = getLearnProgress(db, profileId, index);

	const done = s.results.filter((r) => r?.completed);
	return {
		minutes: Math.round(s.results.reduce((a, r) => a + (r?.actualSec ?? 0), 0) / 60),
		blocksDone: done.length,
		blocksTotal: s.blocks.length,
		pbs,
		reviewed,
		tomorrow: {
			due: [...skills.values()].filter((r) => isDue(r, tomorrowEnd)).length,
			next: progress.next?.title ?? null
		}
	};
}

// ---- goals and settings --------------------------------------------------------------------------

export function getSettings(db: Db, profileId: number): Settings {
	const r = db.select().from(profileSettings).where(eq(profileSettings.profileId, profileId)).get();
	return r
		? { weeklyDays: r.weeklyDays, dailyMin: r.dailyMin, sessionMin: r.sessionMin }
		: { ...DEFAULT_SETTINGS };
}

export function saveSettings(db: Db, profileId: number, s: Settings): Settings {
	db.insert(profileSettings)
		.values({ profileId, ...s })
		.onConflictDoUpdate({ target: profileSettings.profileId, set: s })
		.run();
	return getSettings(db, profileId);
}

/** Session minutes per local day, from `since` (inclusive). */
export function minutesByDay(db: Db, profileId: number, since: string): Record<string, number> {
	const rows = db
		.select({
			date: practiceSession.date,
			min: sql<number>`sum(${practiceSession.actualMin})`
		})
		.from(practiceSession)
		.where(and(eq(practiceSession.profileId, profileId), gte(practiceSession.date, since)))
		.groupBy(practiceSession.date)
		.all();
	return Object.fromEntries(rows.map((r) => [r.date, Number(r.min)]));
}

/** The day of the first session (null before any). */
export function firstSessionDate(db: Db, profileId: number): string | null {
	const r = db
		.select({ first: min(practiceSession.date) })
		.from(practiceSession)
		.where(eq(practiceSession.profileId, profileId))
		.get();
	return r?.first ?? null;
}

export function getGoals(db: Db, profileId: number, today: string) {
	const settings = getSettings(db, profileId);
	const firstDate = firstSessionDate(db, profileId);
	const byDay = minutesByDay(db, profileId, weekStart(firstDate ?? today));
	return { settings, firstDate, ...weeklyGoals(byDay, today, settings, firstDate) };
}

// ---- history -------------------------------------------------------------------------------------

export const HISTORY_DAYS = 56;

type Point = { date: string; value: number };

/** Per-day maxima as a series per key (oldest first). */
function dailyMax(rows: { key: string; at: Date; value: number }[], toDay: (d: Date) => string) {
	const out = new Map<string, Map<string, number>>();
	for (const r of rows) {
		const series = out.get(r.key) ?? new Map<string, number>();
		const day = toDay(r.at);
		series.set(day, Math.max(series.get(day) ?? 0, r.value));
		out.set(r.key, series);
	}
	return new Map(
		[...out].map(([k, m]) => [
			k,
			[...m]
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([date, value]) => ({ date, value }) as Point)
		])
	);
}

const lastDate = (points: Point[]) => points[points.length - 1].date;

export function getHistory(
	db: Db,
	profileId: number,
	index: LearnIndex,
	today: string,
	tz: Tz = 0
) {
	const toDay = (d: Date) => localDay(d.getTime(), tz);
	const first = addDays(today, -(HISTORY_DAYS - 1));
	const since = new Date(startOfDay(first, tz));
	const settings = getSettings(db, profileId);
	const firstDate = firstSessionDate(db, profileId);
	// Minutes per day, once: from the first session's week (the streak goes back that far).
	const byDay = minutesByDay(
		db,
		profileId,
		weekStart(firstDate && firstDate < first ? firstDate : first)
	);
	const days = Array.from({ length: HISTORY_DAYS }, (_, i) => {
		const date = addDays(first, i);
		return { date, minutes: byDay[date] ?? 0 };
	});
	const progress = getLearnProgress(db, profileId, index);

	// Tempo: best clean BPM per day in the window, per exercise; best and stalled as everywhere.
	const attempts = db
		.select({
			key: exerciseAttempt.exerciseId,
			at: exerciseAttempt.createdAt,
			value: exerciseAttempt.bpm
		})
		.from(exerciseAttempt)
		.where(
			and(
				eq(exerciseAttempt.profileId, profileId),
				eq(exerciseAttempt.clean, true),
				gte(exerciseAttempt.createdAt, since)
			)
		)
		.orderBy(asc(exerciseAttempt.id))
		.all();
	const recent = recentAttempts(db, profileId);
	const exercises = [...dailyMax(attempts, toDay)]
		.flatMap(([id, points]) => {
			const ex = index.exercises.find((e) => e.id === id);
			const st = progress.exercises[id];
			if (!ex || !st) return [];
			return [
				{
					id,
					title: ex.title,
					target: ex.targetBpm,
					best: st.best ?? Math.max(...points.map((p) => p.value)),
					ladderBpm: st.resumeBpm,
					mastered: st.mastered,
					stalled: isStalled(
						st.mastered,
						(recent.get(id) ?? []).map((r) => r.ladderBpm)
					),
					points
				}
			];
		})
		.sort((a, b) => lastDate(b.points).localeCompare(lastDate(a.points)));

	// Changes per minute: best count per day in the window, per pair; goal from its lesson.
	const records = db
		.select({
			a: chordChangeRecord.chordA,
			b: chordChangeRecord.chordB,
			at: chordChangeRecord.createdAt,
			value: chordChangeRecord.count
		})
		.from(chordChangeRecord)
		.where(and(eq(chordChangeRecord.profileId, profileId), gte(chordChangeRecord.createdAt, since)))
		.orderBy(asc(chordChangeRecord.id))
		.all();
	const goals = new Map<string, number>();
	for (const l of index.lessons)
		if (l.mastery?.type === 'changes') {
			const key = lessonPairKey(l.mastery);
			goals.set(key, Math.max(goals.get(key) ?? 0, l.mastery.target));
		}
	const allBest = new Map(
		listChangePairs(db, profileId).map((p) => [pairKey(p.chordA, p.chordB), p.best])
	);
	const pairs = [
		...dailyMax(
			records.map((r) => ({ ...r, key: pairKey(r.a, r.b) })),
			toDay
		)
	]
		.map(([key, points]) => {
			const [a, b] = canonicalPair(...(key.split('|') as [string, string]));
			return {
				a,
				b,
				target: goals.get(key) ?? CHANGES_GOAL,
				best: allBest.get(key) ?? Math.max(...points.map((p) => p.value)),
				points
			};
		})
		.sort((x, y) => lastDate(y.points).localeCompare(lastDate(x.points)));

	// Skills per level: `mastered` counts every mastered skill (due ones too, as the badge does);
	// the bar splits them into mastered and due.
	const stored = storedSkills(db, profileId);
	const endOfToday = dueBy(today, tz);
	const levels = index.levels
		.filter((l) => l.units.length)
		.map((l) => {
			const counts = { mastered: 0, due: 0, learning: 0, new: 0 };
			let masteredTotal = 0;
			for (const u of l.units)
				for (const k of u.skills) {
					const row = stored.get(k.id);
					const status = row?.status ?? progress.skills[k.id] ?? 'new';
					if (status === 'mastered') masteredTotal++;
					if (isDue(row, endOfToday)) counts.due++;
					else counts[status]++;
				}
			return {
				id: l.id,
				title: l.title,
				counts,
				masteredTotal,
				total: l.units.reduce((a, u) => a + u.skills.length, 0),
				mastered: progress.masteredLevels.includes(l.id)
			};
		});

	const sessions = db
		.select({
			n: sql<number>`count(*)`,
			min: sql<number>`coalesce(sum(${practiceSession.actualMin}), 0)`
		})
		.from(practiceSession)
		.where(eq(practiceSession.profileId, profileId))
		.get();
	const weeks = Array.from({ length: 8 }, (_, i) =>
		weekStatus(byDay, addDays(weekStart(today), -7 * (7 - i)), today, settings)
	);
	return {
		days,
		exercises,
		pairs,
		levels,
		weeks,
		goals: weeklyGoals(byDay, today, settings, firstDate),
		firstDate,
		totals: { sessions: Number(sessions?.n ?? 0), minutes: Number(sessions?.min ?? 0) }
	};
}

export type History = ReturnType<typeof getHistory>;
