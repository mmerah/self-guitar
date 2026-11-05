// Ear-trainer answers and fretboard-quiz rounds: stored per profile, read back as the trainer's
// history (adaptive choices across visits), per-item accuracy, quiz bests, and the snapshot the
// mastery checks use.
import { and, asc, count, desc, eq, min, sql } from 'drizzle-orm';
import { z } from 'zod';
import { EAR_KINDS, isEarItem, type EarKind } from '$lib/ear/items';
import { isQuiz, quizMaxFound, quizSpec, roundPassed } from '$lib/fretboard/quiz';
import type { Db } from './db';
import { earResult, fretboardResult } from './db/schema';
import { lessonRefSchema, tzSchema } from './validate';

/** Answers the trainer replays (oldest first) to set its choices and confusions. */
export const EAR_HISTORY = 400;

export const earInputSchema = z
	.strictObject({
		kind: z.enum(EAR_KINDS),
		item: z.string().min(1).max(12),
		/** What was answered: an item of the kind, or "" for a skipped play-back note. */
		answer: z.string().max(12),
		tz: tzSchema.optional(),
		lesson: lessonRefSchema.optional()
	})
	.refine((r) => isEarItem(r.kind, r.item), { message: 'unknown item for this kind' })
	.refine((r) => r.answer === '' || isEarItem(r.kind, r.answer), {
		message: 'unknown answer for this kind'
	});

export type EarInput = z.infer<typeof earInputSchema>;
export type EarRow = { item: string; answer: string; correct: boolean; at: number };
export type EarSummary = {
	kind: EarKind;
	/** The latest answers, oldest first. */
	history: EarRow[];
	/** All-time answers and correct answers per item. */
	items: { item: string; total: number; correct: number }[];
};

export function earSummary(db: Db, profileId: number, kind: EarKind): EarSummary {
	const where = and(eq(earResult.profileId, profileId), eq(earResult.kind, kind));
	const history = db
		.select()
		.from(earResult)
		.where(where)
		.orderBy(desc(earResult.id))
		.limit(EAR_HISTORY)
		.all()
		.reverse()
		.map((r) => ({
			item: r.item,
			answer: r.answer,
			correct: r.correct,
			at: r.createdAt.getTime()
		}));
	const items = db
		.select({
			item: earResult.item,
			total: count(),
			correct: sql<number>`sum(case when ${earResult.correct} then 1 else 0 end)`
		})
		.from(earResult)
		.where(where)
		.groupBy(earResult.item)
		.orderBy(asc(earResult.item))
		.all()
		.map((r) => ({ item: r.item, total: r.total, correct: Number(r.correct) }));
	return { kind, history, items };
}

export function saveEarResult(db: Db, profileId: number, input: EarInput) {
	db.insert(earResult)
		.values({
			profileId,
			kind: input.kind,
			item: input.item,
			answer: input.answer,
			correct: input.item === input.answer
		})
		.run();
	return earSummary(db, profileId, input.kind);
}

/** The latest answers of every kind, newest first (the ear mastery checks' snapshot). */
export function recentEar(db: Db, profileId: number): Record<string, EarRow[]> {
	const rows = db.all<{
		kind: string;
		item: string;
		answer: string;
		correct: number;
		at: number;
	}>(sql`
		SELECT kind, item, answer, correct, created_at AS at FROM (
			SELECT *, row_number() OVER (PARTITION BY kind ORDER BY id DESC) AS rn
			FROM ear_result WHERE profile_id = ${profileId}
		) WHERE rn <= ${EAR_HISTORY} ORDER BY id DESC`);
	const out: Record<string, EarRow[]> = {};
	for (const r of rows)
		(out[r.kind] ??= []).push({
			item: r.item,
			answer: r.answer,
			correct: !!r.correct,
			at: r.at * 1000
		});
	return out;
}

// ---- fretboard quiz ---------------------------------------------------------------------------

export const fretboardInputSchema = z
	.strictObject({
		quiz: z.string().refine(isQuiz, 'unknown quiz'),
		found: z.number().int().min(1).max(100),
		wrong: z.number().int().min(0).max(500),
		ms: z
			.number()
			.int()
			.min(500)
			.max(30 * 60_000),
		tz: tzSchema.optional(),
		lesson: lessonRefSchema.optional()
	})
	// A round finds each prompt's positions once: no more than the quiz holds.
	.refine((r) => !isQuiz(r.quiz) || r.found <= quizMaxFound(quizSpec(r.quiz)), {
		message: 'found is more than this quiz has notes',
		path: ['found']
	});
export type FretboardInput = z.infer<typeof fretboardInputSchema>;

export type QuizSummary = {
	quiz: string;
	tries: number;
	/** Fastest passing round (ms), null before one. */
	best: number | null;
	/** The latest rounds, newest first. */
	recent: { found: number; wrong: number; ms: number; passed: boolean; at: number }[];
};

export function quizSummary(db: Db, profileId: number, quiz: string): QuizSummary {
	const rows = db
		.select()
		.from(fretboardResult)
		.where(and(eq(fretboardResult.profileId, profileId), eq(fretboardResult.quiz, quiz)))
		.orderBy(desc(fretboardResult.id))
		.all();
	const passed = rows.filter((r) => roundPassed(r.found, r.wrong));
	return {
		quiz,
		tries: rows.length,
		best: passed.length ? Math.min(...passed.map((r) => r.ms)) : null,
		recent: rows.slice(0, 5).map((r) => ({
			found: r.found,
			wrong: r.wrong,
			ms: r.ms,
			passed: roundPassed(r.found, r.wrong),
			at: r.createdAt.getTime()
		}))
	};
}

export function listQuizzes(db: Db, profileId: number): QuizSummary[] {
	return db
		.selectDistinct({ quiz: fretboardResult.quiz })
		.from(fretboardResult)
		.where(eq(fretboardResult.profileId, profileId))
		.all()
		.map((r) => quizSummary(db, profileId, r.quiz));
}

export function saveQuizResult(db: Db, profileId: number, input: FretboardInput): QuizSummary {
	const { quiz, found, wrong, ms } = input;
	db.insert(fretboardResult).values({ profileId, quiz, found, wrong, ms }).run();
	return quizSummary(db, profileId, quiz);
}

/** Fastest passing round per quiz (the fretboard mastery checks' snapshot). */
export function quizBests(db: Db, profileId: number): Record<string, number> {
	const out: Record<string, number> = {};
	for (const r of db
		.select({
			quiz: fretboardResult.quiz,
			found: fretboardResult.found,
			wrong: fretboardResult.wrong,
			ms: fretboardResult.ms
		})
		.from(fretboardResult)
		.where(eq(fretboardResult.profileId, profileId))
		.all())
		if (roundPassed(r.found, r.wrong) && (out[r.quiz] === undefined || r.ms < out[r.quiz]))
			out[r.quiz] = r.ms;
	return out;
}

/** When a quiz was first passed within `seconds`, or null. */
export function quizPassedAt(
	db: Db,
	profileId: number,
	quiz: string,
	seconds: number
): Date | null {
	const r = db
		.select({ at: min(fretboardResult.createdAt) })
		.from(fretboardResult)
		.where(
			and(
				eq(fretboardResult.profileId, profileId),
				eq(fretboardResult.quiz, quiz),
				sql`${fretboardResult.ms} <= ${seconds * 1000}`,
				sql`${fretboardResult.wrong} * 10 <= ${fretboardResult.found}`
			)
		)
		.get();
	return r?.at ?? null;
}
