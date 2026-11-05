// Curriculum progress: lesson status, exercise attempts and self-assessed mastery records, turned
// into lesson states and skill status by the pure evaluator ($lib/learn/evaluate). Every write
// also syncs the derived skill status into skill_state (reads never write).
import { and, desc, eq, gte, inArray, isNotNull, max, min, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getChord } from '$lib/chords';
import { canonicalPair, pairKey } from '$lib/chordChanges';
import {
	currentProgress,
	evaluate,
	type ExerciseSummary,
	type Snapshot
} from '$lib/learn/evaluate';
import {
	attemptRange,
	ladderRate,
	ladderStart,
	MISSES_TO_DROP,
	type LadderState
} from '$lib/learn/ladder';
import { nextSkillState, type SkillRow } from '$lib/learn/review';
import { dueBy } from '$lib/session/time';
import { lessonRefSchema, tzSchema } from './validate';
import type {
	ExerciseMeta,
	ExerciseDetail,
	ExerciseStats,
	HeardPass,
	LearnIndex,
	LearnProgress,
	LessonMeta
} from '$lib/learn/types';
import { BPM_MAX, BPM_MIN } from '$lib/metronome/timeline';
import type { Db } from './db';
import { quizBests, quizPassedAt, recentEar } from './ear';
import {
	chordChangeRecord,
	earResult,
	exerciseAttempt,
	fretboardResult,
	lessonProgress,
	maintenanceTask,
	masteryRecord,
	practiceSession,
	sessionBlock,
	skillState
} from './db/schema';

export const lessonStatusInputSchema = z.strictObject({
	status: z.enum(['started', 'completed'])
});

export const attemptInputSchema = z
	.strictObject({
		bpm: z.number().int().min(BPM_MIN).max(BPM_MAX),
		clean: z.boolean(),
		/** The learner's zone: decides which reviews are due today. */
		tz: tzSchema.optional(),
		/** Mic check (M7): notes heard right and notes counted in the pass (both or neither). */
		hits: z.number().int().min(0).max(10_000).optional(),
		total: z.number().int().min(1).max(10_000).optional(),
		/** The lesson the pass was played in (it becomes started). */
		lesson: lessonRefSchema.optional()
	})
	.refine((a) => (a.hits === undefined) === (a.total === undefined), {
		message: 'hits and total go together'
	})
	.refine((a) => a.hits === undefined || a.hits <= a.total!, {
		message: 'hits must not exceed total'
	});

/** A reset takes no options (an empty body or `{}`). */
export const resetInputSchema = z.strictObject({});

/** Self checks send the indexes of the ticked items (all of them); tuner checks send nothing. */
export const masteryInputSchema = z.strictObject({
	checked: z.array(z.number().int().min(0)).max(8).optional()
});

export type AttemptInput = z.infer<typeof attemptInputSchema>;

type ExerciseRow = ExerciseSummary & { attempts: number; ladderBpm: number | null };

/**
 * Every exercise's stats in one GROUP BY: attempts, best clean BPM, best completed streak,
 * mastered, and the ladder tempo stored with the latest attempt.
 */
function exerciseRows(db: Db, profileId: number, exerciseId?: string): Map<string, ExerciseRow> {
	const where = exerciseId
		? and(eq(exerciseAttempt.profileId, profileId), eq(exerciseAttempt.exerciseId, exerciseId))
		: eq(exerciseAttempt.profileId, profileId);
	const agg = db
		.select({
			id: exerciseAttempt.exerciseId,
			attempts: sql<number>`count(*)`.as('attempts'),
			best: sql<
				number | null
			>`max(case when ${exerciseAttempt.clean} then ${exerciseAttempt.bpm} end)`.as('best'),
			streakBest: sql<
				number | null
			>`max(case when ${exerciseAttempt.clean} and (${exerciseAttempt.ladderBpm} > ${exerciseAttempt.bpm} or ${exerciseAttempt.mastered}) then ${exerciseAttempt.bpm} end)`.as(
				'streak_best'
			),
			mastered: sql<number>`max(${exerciseAttempt.mastered})`.as('any_mastered'),
			lastId: max(exerciseAttempt.id).as('last_id')
		})
		.from(exerciseAttempt)
		.where(where)
		.groupBy(exerciseAttempt.exerciseId)
		.as('agg');
	const rows = db
		.select({
			id: agg.id,
			attempts: agg.attempts,
			best: agg.best,
			streakBest: agg.streakBest,
			mastered: agg.mastered,
			ladderBpm: exerciseAttempt.ladderBpm
		})
		.from(agg)
		.leftJoin(exerciseAttempt, eq(exerciseAttempt.id, agg.lastId))
		.all();
	return new Map(
		rows.map((r) => [
			r.id,
			{
				attempts: Number(r.attempts),
				best: r.best,
				streakBest: r.streakBest,
				mastered: !!r.mastered,
				ladderBpm: r.ladderBpm
			}
		])
	);
}

function toStats(ex: ExerciseMeta, row: ExerciseRow | undefined): ExerciseStats {
	return {
		best: row?.best ?? null,
		streakBest: row?.streakBest ?? null,
		resumeBpm: ladderStart(ex, { bpm: row?.ladderBpm ?? ex.startBpm }).bpm,
		attempts: row?.attempts ?? 0,
		mastered: row?.mastered ?? false
	};
}

function snapshot(db: Db, profileId: number, exercises: Map<string, ExerciseRow>): Snapshot {
	const lessons: Snapshot['lessons'] = {};
	const touched: Record<string, number> = {};
	for (const r of db
		.select()
		.from(lessonProgress)
		.where(eq(lessonProgress.profileId, profileId))
		.all()) {
		lessons[r.lessonId] = r.status;
		touched[r.lessonId] = r.updatedAt.getTime();
	}

	const changeBest: Snapshot['changeBest'] = {};
	for (const r of db
		.select({
			a: chordChangeRecord.chordA,
			b: chordChangeRecord.chordB,
			best: max(chordChangeRecord.count)
		})
		.from(chordChangeRecord)
		.where(eq(chordChangeRecord.profileId, profileId))
		.groupBy(chordChangeRecord.chordA, chordChangeRecord.chordB)
		.all())
		changeBest[pairKey(r.a, r.b)] = r.best ?? 0;

	const confirmed = new Set(
		db
			.selectDistinct({ id: masteryRecord.lessonId })
			.from(masteryRecord)
			.where(eq(masteryRecord.profileId, profileId))
			.all()
			.map((r) => r.id)
	);
	return {
		lessons,
		touched,
		exercises: Object.fromEntries(exercises),
		changeBest,
		confirmed,
		ear: recentEar(db, profileId),
		quizBest: quizBests(db, profileId)
	};
}

/** Lesson states, mastery checks, skill status, exercise stats and the next lesson. Read-only. */
export function getLearnProgress(db: Db, profileId: number, index: LearnIndex): LearnProgress {
	const rows = exerciseRows(db, profileId);
	const progress = evaluate(index, snapshot(db, profileId, rows));
	for (const ex of index.exercises) progress.exercises[ex.id] = toStats(ex, rows.get(ex.id));
	return progress;
}

// ---- skill_state sync (write paths) --------------------------------------------------------------

/** When a lesson's check was first satisfied: the created_at of the record that satisfied it. */
function satisfiedAt(
	db: Db,
	profileId: number,
	lesson: LessonMeta,
	index: LearnIndex
): Date | null {
	const m = lesson.mastery;
	if (!m) {
		const r = db
			.select({ at: lessonProgress.completedAt })
			.from(lessonProgress)
			.where(and(eq(lessonProgress.profileId, profileId), eq(lessonProgress.lessonId, lesson.id)))
			.get();
		return r?.at ?? null;
	}
	switch (m.type) {
		case 'changes': {
			const [a, b] = canonicalPair(getChord(m.a)?.id ?? m.a, getChord(m.b)?.id ?? m.b);
			const r = db
				.select({ at: min(chordChangeRecord.createdAt) })
				.from(chordChangeRecord)
				.where(
					and(
						eq(chordChangeRecord.profileId, profileId),
						eq(chordChangeRecord.chordA, a),
						eq(chordChangeRecord.chordB, b),
						gte(chordChangeRecord.count, m.target)
					)
				)
				.get();
			return r?.at ?? null;
		}
		case 'exercise': {
			if (!index.exercises.some((e) => e.id === m.id)) return null;
			const r = db
				.select({ at: min(exerciseAttempt.createdAt) })
				.from(exerciseAttempt)
				.where(
					and(
						eq(exerciseAttempt.profileId, profileId),
						eq(exerciseAttempt.exerciseId, m.id),
						eq(exerciseAttempt.clean, true),
						gte(exerciseAttempt.bpm, m.bpm),
						sql`(${exerciseAttempt.ladderBpm} > ${exerciseAttempt.bpm} or ${exerciseAttempt.mastered})`
					)
				)
				.get();
			return r?.at ?? null;
		}
		case 'ear': {
			// Recorded when the latest answers first met the check; else the newest answer.
			const r = recordedAt(db, profileId, lesson.id);
			if (r) return r;
			const latest = recentEar(db, profileId)[m.kind]?.[0];
			return latest ? new Date(latest.at) : null;
		}
		case 'fretboard':
			return quizPassedAt(db, profileId, m.quiz, m.target);
		case 'self':
		case 'tuner':
			return recordedAt(db, profileId, lesson.id);
	}
}

/** When a lesson's mastery was first recorded (mastery_record), or null. */
function recordedAt(db: Db, profileId: number, lessonId: string): Date | null {
	const r = db
		.select({ at: min(masteryRecord.createdAt) })
		.from(masteryRecord)
		.where(and(eq(masteryRecord.profileId, profileId), eq(masteryRecord.lessonId, lessonId)))
		.get();
	return r?.at ?? null;
}

/**
 * Records the mastery of every lesson whose check is met by the data now and was never recorded
 * (a mastery_record with the check's value): from then on the lesson stays mastered, whatever
 * later answers or rounds do. Self and tuner checks are recorded by their own confirmation.
 */
function recordAchieved(db: Db, profileId: number, index: LearnIndex, snap: Snapshot): boolean {
	let added = false;
	for (const l of index.lessons) {
		const m = l.mastery;
		if (!m || m.type === 'self' || m.type === 'tuner' || snap.confirmed.has(l.id)) continue;
		const p = currentProgress(l.id, m, snap);
		if (!p.done) continue;
		db.insert(masteryRecord)
			.values({ profileId, lessonId: l.id, value: `${m.type}:${p.value ?? ''}` })
			.run();
		snap.confirmed.add(l.id);
		added = true;
	}
	return added;
}

/**
 * Writes the derived skill status after a progress write, through the review rules
 * ($lib/learn/review: the one place deciding status). A newly mastered skill gets mastered_at =
 * when its last lesson check was satisfied (the satisfying record's created_at) and its first
 * review a day later; rows with due_at set belong to the review schedule and are left alone.
 */
export function syncSkillStates(db: Db, profileId: number, index: LearnIndex) {
	const snap = snapshot(db, profileId, exerciseRows(db, profileId));
	recordAchieved(db, profileId, index, snap);
	const { skills } = evaluate(index, snap);
	const stored = storedSkills(db, profileId);
	const now = Date.now();
	db.transaction((tx) => {
		for (const [skillId, status] of Object.entries(skills)) {
			const prev = stored.get(skillId);
			if (prev?.dueAt) continue;
			let masteredAt: number | undefined;
			if (status === 'mastered' && !prev?.masteredAt) {
				const times = index.lessons
					.filter((l) => l.skills.includes(skillId))
					.map((l) => satisfiedAt(db, profileId, l, index)?.getTime() ?? 0);
				masteredAt = Math.max(0, ...times) || now;
			}
			const next = nextSkillState(prev, { type: 'derive', status, masteredAt }, now);
			if (next) writeSkill(tx, profileId, skillId, next);
		}
	});
}

/** Stored skill rows as plain numbers (ms), keyed by skill id. */
export function storedSkills(
	db: Db,
	profileId: number
): Map<string, SkillRow & { skillId: string }> {
	return new Map(
		db
			.select()
			.from(skillState)
			.where(eq(skillState.profileId, profileId))
			.all()
			.map((r) => [
				r.skillId,
				{
					skillId: r.skillId,
					status: r.status,
					masteredAt: r.masteredAt?.getTime() ?? null,
					dueAt: r.dueAt?.getTime() ?? null,
					ease: r.ease
				}
			])
	);
}

function writeSkill(db: Pick<Db, 'insert'>, profileId: number, skillId: string, row: SkillRow) {
	const values = {
		status: row.status,
		masteredAt: row.masteredAt === null ? null : new Date(row.masteredAt),
		dueAt: row.dueAt === null ? null : new Date(row.dueAt),
		ease: row.ease
	};
	db.insert(skillState)
		.values({ profileId, skillId, ...values })
		.onConflictDoUpdate({ target: [skillState.profileId, skillState.skillId], set: values })
		.run();
}

/**
 * A review outcome for some skills (a rated session block, a ladder streak at the target, a miss
 * streak): advances or lapses the ones that are due (before `dueBy`, the end of the learner's
 * day). Returns the skills whose schedule changed, with their new row.
 */
export function applyReview(
	db: Db,
	profileId: number,
	skillIds: string[],
	good: boolean,
	now = Date.now(),
	dueBy = now
): { skillId: string; row: SkillRow }[] {
	const stored = storedSkills(db, profileId);
	const changed: { skillId: string; row: SkillRow }[] = [];
	db.transaction((tx) => {
		for (const skillId of new Set(skillIds)) {
			const next = nextSkillState(stored.get(skillId), { type: 'review', good }, now, dueBy);
			if (!next) continue;
			writeSkill(tx, profileId, skillId, next);
			changed.push({ skillId, row: next });
		}
	});
	return changed;
}

// ---- writes --------------------------------------------------------------------------------------

/** Sets a lesson's status; "started" never downgrades a completed lesson. */
export function setLessonStatus(
	db: Db,
	profileId: number,
	lessonId: string,
	status: 'started' | 'completed'
) {
	const now = new Date();
	const values =
		status === 'completed'
			? { profileId, lessonId, status, updatedAt: now, completedAt: now }
			: { profileId, lessonId, status, updatedAt: now };
	const set =
		status === 'completed'
			? {
					status,
					updatedAt: now,
					completedAt: sql`coalesce(${lessonProgress.completedAt}, ${Math.floor(now.getTime() / 1000)})`
				}
			: { updatedAt: now };
	db.insert(lessonProgress)
		.values(values)
		.onConflictDoUpdate({ target: [lessonProgress.profileId, lessonProgress.lessonId], set })
		.run();
}

/**
 * Practice earned in a lesson (an attempt, a check, a changes / ear / fretboard result sent with
 * its lesson) starts it: opening a lesson alone never does (M7.1). Unknown ids are ignored;
 * a completed lesson stays completed. Returns whether the lesson exists.
 */
export function startPractised(
	db: Db,
	profileId: number,
	index: LearnIndex,
	lessonId: string | undefined
): boolean {
	if (!lessonId || !index.lessons.some((l) => l.id === lessonId)) return false;
	setLessonStatus(db, profileId, lessonId, 'started');
	return true;
}

/**
 * Resets a lesson to not started: its lesson_progress row goes, so it leaves the plan and the
 * "Continue" pick. History (attempts, mastery records, changes / ear / quiz results, sessions)
 * stays, so stats and passed checks remain; skill status is re-derived by the caller
 * (syncSkillStates): a skill only this lesson made "learning" goes back to new, scheduled
 * (mastered or lapsed) skills belong to the review schedule and are untouched.
 */
export function resetLesson(db: Db, profileId: number, lessonId: string) {
	db.delete(lessonProgress)
		.where(and(eq(lessonProgress.profileId, profileId), eq(lessonProgress.lessonId, lessonId)))
		.run();
}

/** Exercises a lesson checks or embeds (compiled into the index). */
const lessonExercises = (l: LessonMeta) => [
	...new Set([...(l.exercises ?? []), ...(l.mastery?.type === 'exercise' ? [l.mastery.id] : [])])
];

/**
 * Was any practice ever stored for this lesson? Attempts on its exercises, a mastery record, a
 * session block on it that was played (done, not skipped, or timed), or results for its own
 * mastery check (its changes pair, its ear items, its fretboard quiz). Errs on the side of yes.
 */
export function lessonPractised(db: Db, profileId: number, l: LessonMeta): boolean {
	const exIds = lessonExercises(l);
	if (
		exIds.length &&
		db
			.select({ id: exerciseAttempt.id })
			.from(exerciseAttempt)
			.where(
				and(eq(exerciseAttempt.profileId, profileId), inArray(exerciseAttempt.exerciseId, exIds))
			)
			.limit(1)
			.get()
	)
		return true;
	if (recordedAt(db, profileId, l.id)) return true;
	const blocks = db
		.select({
			target: sessionBlock.targetJson,
			completed: sessionBlock.completed,
			skipped: sessionBlock.skipped,
			sec: sessionBlock.actualSec
		})
		.from(sessionBlock)
		.innerJoin(practiceSession, eq(practiceSession.id, sessionBlock.sessionId))
		.where(and(eq(practiceSession.profileId, profileId), eq(sessionBlock.kind, 'new')))
		.all();
	for (const b of blocks) {
		if (!((b.completed && !b.skipped) || b.sec > 0)) continue;
		try {
			const t = JSON.parse(b.target) as { type?: string; id?: string };
			if (t.type === 'lesson' && t.id === l.id) return true;
		} catch {
			// a damaged row proves nothing
		}
	}
	const m = l.mastery;
	if (m?.type === 'changes') {
		const [a, b] = canonicalPair(getChord(m.a)?.id ?? m.a, getChord(m.b)?.id ?? m.b);
		return !!db
			.select({ id: chordChangeRecord.id })
			.from(chordChangeRecord)
			.where(
				and(
					eq(chordChangeRecord.profileId, profileId),
					eq(chordChangeRecord.chordA, a),
					eq(chordChangeRecord.chordB, b)
				)
			)
			.limit(1)
			.get();
	}
	if (m?.type === 'ear')
		return !!db
			.select({ id: earResult.id })
			.from(earResult)
			.where(
				and(
					eq(earResult.profileId, profileId),
					eq(earResult.kind, m.kind),
					inArray(earResult.item, m.set)
				)
			)
			.limit(1)
			.get();
	if (m?.type === 'fretboard')
		return !!db
			.select({ id: fretboardResult.id })
			.from(fretboardResult)
			.where(and(eq(fretboardResult.profileId, profileId), eq(fretboardResult.quiz, m.quiz)))
			.limit(1)
			.get();
	return false;
}

/**
 * The M7.1 cleanup: lessons marked started by opening them alone (no practice stored for them,
 * see lessonPractised) go back to not started, for every profile, and skill status is re-derived.
 * Completed lessons and lessons the content no longer has are left alone. Returns the lesson ids
 * reset per profile.
 */
export function cleanupPreviewedLessons(db: Db, index: LearnIndex): Record<number, string[]> {
	const byId = new Map(index.lessons.map((l) => [l.id, l]));
	const started = db
		.select({ profileId: lessonProgress.profileId, lessonId: lessonProgress.lessonId })
		.from(lessonProgress)
		.where(eq(lessonProgress.status, 'started'))
		.all();
	const reset: Record<number, string[]> = {};
	for (const r of started) {
		const l = byId.get(r.lessonId);
		if (!l || lessonPractised(db, r.profileId, l)) continue;
		resetLesson(db, r.profileId, r.lessonId);
		(reset[r.profileId] ??= []).push(r.lessonId);
	}
	for (const p of Object.keys(reset)) syncSkillStates(db, Number(p), index);
	return reset;
}

export const PREVIEW_CLEANUP = 'lesson-preview-cleanup';

/**
 * Runs the one-time data fixes a migration queued (maintenance_task rows), once each: the row is
 * deleted in the same transaction as the fix. Nothing queued: nothing is written. Returns the
 * tasks run.
 */
export function runMaintenance(db: Db, index: LearnIndex): string[] {
	const tasks = db.select({ key: maintenanceTask.key }).from(maintenanceTask).all();
	const ran: string[] = [];
	for (const { key } of tasks) {
		if (key !== PREVIEW_CLEANUP) continue;
		// No curriculum loaded (a broken content file): try again at the next start.
		if (!index.lessons.length) continue;
		db.transaction((tx) => {
			cleanupPreviewedLessons(tx as unknown as Db, index);
			tx.delete(maintenanceTask).where(eq(maintenanceTask.key, key)).run();
		});
		ran.push(key);
	}
	return ran;
}

/**
 * The ladder's position from stored attempts: the tempo saved with the latest one, plus the
 * clean streak / misses in a row at that tempo.
 */
function ladderState(db: Db, profileId: number, ex: ExerciseMeta): LadderState {
	const recent = db
		.select({
			bpm: exerciseAttempt.bpm,
			clean: exerciseAttempt.clean,
			ladderBpm: exerciseAttempt.ladderBpm,
			mastered: exerciseAttempt.mastered
		})
		.from(exerciseAttempt)
		.where(and(eq(exerciseAttempt.profileId, profileId), eq(exerciseAttempt.exerciseId, ex.id)))
		.orderBy(desc(exerciseAttempt.id))
		.limit(Math.max(ex.cleanReps, MISSES_TO_DROP) + 1)
		.all();
	if (!recent.length) return ladderStart(ex);
	const bpm = recent[0].ladderBpm;
	const run = (clean: boolean) => {
		let n = 0;
		// Passes at the current tempo since it was reached (a completed streak ends the run).
		for (const r of recent) {
			if (r.clean !== clean || r.bpm !== bpm || r.ladderBpm !== bpm || r.mastered) break;
			n++;
		}
		return n;
	};
	return ladderStart(ex, { bpm, streak: run(true), misses: run(false) });
}

/** How many mic-checked passes ExerciseDetail.heard lists. */
export const HEARD_RECENT = 5;

/** The latest mic-checked passes of an exercise, oldest first. */
function heardPasses(db: Db, profileId: number, exerciseId: string): HeardPass[] {
	return db
		.select({
			hits: exerciseAttempt.hits,
			total: exerciseAttempt.total,
			clean: exerciseAttempt.clean,
			bpm: exerciseAttempt.bpm
		})
		.from(exerciseAttempt)
		.where(
			and(
				eq(exerciseAttempt.profileId, profileId),
				eq(exerciseAttempt.exerciseId, exerciseId),
				isNotNull(exerciseAttempt.total)
			)
		)
		.orderBy(desc(exerciseAttempt.id))
		.limit(HEARD_RECENT)
		.all()
		.map((r) => ({ hits: r.hits!, total: r.total!, clean: r.clean, bpm: r.bpm }))
		.reverse();
}

export function exerciseDetail(db: Db, profileId: number, ex: ExerciseMeta): ExerciseDetail {
	const { streak, misses } = ladderState(db, profileId, ex);
	return {
		...toStats(ex, exerciseRows(db, profileId, ex.id).get(ex.id)),
		streak,
		misses,
		heard: heardPasses(db, profileId, ex.id)
	};
}

/** Problem with an attempt's tempo, or null: it must be on (or near) the exercise's ladder. */
export function attemptProblem(ex: ExerciseMeta, input: AttemptInput): string | null {
	const { min, max } = attemptRange(ex);
	return input.bpm < min || input.bpm > max ? `bpm must be ${min}-${max} for this exercise` : null;
}

/**
 * Records one rated pass: replays the ladder rules from the stored position (or from the
 * client's tempo if it differs, e.g. a stale tab), stores where the ladder now stands and
 * whether this pass completed a clean streak at the target (mastered).
 */
export function recordAttempt(
	db: Db,
	profileId: number,
	ex: ExerciseMeta,
	input: AttemptInput,
	index: LearnIndex
): ExerciseDetail {
	const stored = ladderState(db, profileId, ex);
	const from = stored.bpm === input.bpm ? stored : { bpm: input.bpm, streak: 0, misses: 0 };
	const { state, event } = ladderRate(ex, from, input.clean);
	db.insert(exerciseAttempt)
		.values({
			profileId,
			exerciseId: ex.id,
			bpm: input.bpm,
			clean: input.clean,
			// Off-ladder tempos (old content) resume at the nearest ladder tempo.
			ladderBpm: ladderStart(ex, state).bpm,
			mastered: event === 'mastered',
			hits: input.hits ?? null,
			total: input.total ?? null
		})
		.run();
	syncSkillStates(db, profileId, index);
	// A clean streak at the target reviews the exercise's skills well (lapses only come from a
	// 😖 block rating, never from a ladder step down).
	const now = Date.now();
	if (event === 'mastered')
		applyReview(db, profileId, ex.skills, true, now, dueBy(undefined, input.tz, now));
	return exerciseDetail(db, profileId, ex);
}

/**
 * Records a self-assessed check. Returns an error message when the lesson has no such check or
 * not every checklist item is ticked.
 */
export function confirmMastery(
	db: Db,
	profileId: number,
	lesson: LessonMeta,
	checked: number[] | undefined
): string | null {
	const m = lesson.mastery;
	if (m?.type === 'self') {
		const all = m.items.every((_, i) => checked?.includes(i));
		if (!all || checked!.some((i) => i >= m.items.length)) return 'tick every item to confirm';
		db.insert(masteryRecord)
			.values({ profileId, lessonId: lesson.id, value: `${m.items.length}/${m.items.length}` })
			.run();
		return null;
	}
	if (m?.type === 'tuner') {
		if (checked?.length) return 'the tuner check has no items';
		db.insert(masteryRecord).values({ profileId, lessonId: lesson.id, value: 'tuner' }).run();
		return null;
	}
	return 'this lesson has no self-assessed mastery check';
}
