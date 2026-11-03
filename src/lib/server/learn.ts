// Curriculum progress: lesson status, exercise attempts and self-assessed mastery records, turned
// into lesson states and skill status by the pure evaluator ($lib/learn/evaluate). Every write
// also syncs the derived skill status into skill_state (reads never write).
import { and, desc, eq, gte, max, min, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getChord } from '$lib/chords';
import { canonicalPair, pairKey } from '$lib/chordChanges';
import { evaluate, type ExerciseSummary, type Snapshot } from '$lib/learn/evaluate';
import {
	attemptRange,
	ladderRate,
	ladderStart,
	MISSES_TO_DROP,
	type LadderState
} from '$lib/learn/ladder';
import type {
	Exercise,
	ExerciseDetail,
	ExerciseStats,
	LearnIndex,
	LearnProgress,
	Lesson
} from '$lib/learn/types';
import { BPM_MAX, BPM_MIN } from '$lib/metronome/timeline';
import type { Db } from './db';
import {
	chordChangeRecord,
	exerciseAttempt,
	lessonProgress,
	masteryRecord,
	skillState
} from './db/schema';

export const lessonStatusInputSchema = z.strictObject({
	status: z.enum(['started', 'completed'])
});

export const attemptInputSchema = z.strictObject({
	bpm: z.number().int().min(BPM_MIN).max(BPM_MAX),
	clean: z.boolean()
});

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

function toStats(ex: Exercise, row: ExerciseRow | undefined): ExerciseStats {
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
		confirmed
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
function satisfiedAt(db: Db, profileId: number, lesson: Lesson, index: LearnIndex): Date | null {
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
		case 'self':
		case 'tuner': {
			const r = db
				.select({ at: min(masteryRecord.createdAt) })
				.from(masteryRecord)
				.where(and(eq(masteryRecord.profileId, profileId), eq(masteryRecord.lessonId, lesson.id)))
				.get();
			return r?.at ?? null;
		}
	}
}

/**
 * Writes the derived skill status after a progress write. A newly mastered skill gets
 * mastered_at = when its last lesson check was satisfied (the satisfying record's created_at); an
 * existing mastered_at is kept. Rows with due_at set belong to the M4 scheduler: left alone.
 */
export function syncSkillStates(db: Db, profileId: number, index: LearnIndex) {
	const { skills } = evaluate(index, snapshot(db, profileId, exerciseRows(db, profileId)));
	const stored = new Map(
		db
			.select()
			.from(skillState)
			.where(eq(skillState.profileId, profileId))
			.all()
			.map((r) => [r.skillId, r])
	);
	db.transaction((tx) => {
		for (const [skillId, status] of Object.entries(skills)) {
			const prev = stored.get(skillId);
			if (prev?.dueAt) continue;
			if (prev?.status === status) continue;
			if (!prev && status === 'new') continue;
			let masteredAt: Date | null = null;
			if (status === 'mastered') {
				masteredAt = prev?.masteredAt ?? null;
				if (!masteredAt) {
					const times = index.lessons
						.filter((l) => l.skills.includes(skillId))
						.map((l) => satisfiedAt(db, profileId, l, index)?.getTime() ?? 0);
					masteredAt = new Date(Math.max(0, ...times) || Date.now());
				}
			}
			tx.insert(skillState)
				.values({ profileId, skillId, status, masteredAt })
				.onConflictDoUpdate({
					target: [skillState.profileId, skillState.skillId],
					set: { status, masteredAt }
				})
				.run();
		}
	});
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
 * The ladder's position from stored attempts: the tempo saved with the latest one, plus the
 * clean streak / misses in a row at that tempo.
 */
function ladderState(db: Db, profileId: number, ex: Exercise): LadderState {
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

export function exerciseDetail(db: Db, profileId: number, ex: Exercise): ExerciseDetail {
	const { streak, misses } = ladderState(db, profileId, ex);
	return { ...toStats(ex, exerciseRows(db, profileId, ex.id).get(ex.id)), streak, misses };
}

/** Problem with an attempt's tempo, or null: it must be on (or near) the exercise's ladder. */
export function attemptProblem(ex: Exercise, input: AttemptInput): string | null {
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
	ex: Exercise,
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
			mastered: event === 'mastered'
		})
		.run();
	syncSkillStates(db, profileId, index);
	return exerciseDetail(db, profileId, ex);
}

/**
 * Records a self-assessed check. Returns an error message when the lesson has no such check or
 * not every checklist item is ticked.
 */
export function confirmMastery(
	db: Db,
	profileId: number,
	lesson: Lesson,
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
