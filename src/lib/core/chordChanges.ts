import { and, count, desc, eq, max } from 'drizzle-orm';
import { z } from 'zod';
import { getChord } from '$lib/chords';
import { tzSchema } from './validate';
import { canonicalPair, HISTORY_LIMIT, MAX_CHANGES, type ChangePair } from '$lib/chordChanges';
import type { Db } from './db';
import { chordChangeRecord } from './db/schema';

/** Any spelling of a known chord, stored by its canonical id ("Db" is saved as "C#"). */
const chordId = z
	.string()
	.refine((id) => getChord(id) !== undefined, 'unknown chord')
	.transform((id) => getChord(id)!.id);

export const changeInputSchema = z
	.strictObject({
		chordA: chordId,
		chordB: chordId,
		count: z.number().int().min(0).max(MAX_CHANGES),
		/** The learner's zone: decides which reviews are due today. */
		tz: tzSchema.optional()
	})
	.refine((r) => r.chordA !== r.chordB, { message: 'pick two different chords' });

export type ChangeInput = z.infer<typeof changeInputSchema>;

/** Every practised pair with its best and recent history, most recently practised first. */
export function listChangePairs(db: Db, profileId: number): ChangePair[] {
	const last = max(chordChangeRecord.createdAt);
	const pairs = db
		.select({
			chordA: chordChangeRecord.chordA,
			chordB: chordChangeRecord.chordB,
			best: max(chordChangeRecord.count),
			tries: count()
		})
		.from(chordChangeRecord)
		.where(eq(chordChangeRecord.profileId, profileId))
		.groupBy(chordChangeRecord.chordA, chordChangeRecord.chordB)
		.orderBy(desc(last), desc(max(chordChangeRecord.id)))
		.all();
	return pairs.map((p) => ({
		...p,
		best: p.best ?? 0,
		history: pairHistory(db, profileId, p.chordA, p.chordB)
	}));
}

/** The last HISTORY_LIMIT results of a pair, oldest first. */
function pairHistory(db: Db, profileId: number, chordA: string, chordB: string) {
	return db
		.select({ count: chordChangeRecord.count, createdAt: chordChangeRecord.createdAt })
		.from(chordChangeRecord)
		.where(
			and(
				eq(chordChangeRecord.profileId, profileId),
				eq(chordChangeRecord.chordA, chordA),
				eq(chordChangeRecord.chordB, chordB)
			)
		)
		.orderBy(desc(chordChangeRecord.createdAt), desc(chordChangeRecord.id))
		.limit(HISTORY_LIMIT)
		.all()
		.reverse()
		.map((r) => ({ count: r.count, createdAt: r.createdAt.toISOString() }));
}

export function getChangePair(db: Db, profileId: number, a: string, b: string): ChangePair {
	const [chordA, chordB] = canonicalPair(a, b);
	const [stats] = db
		.select({ best: max(chordChangeRecord.count), tries: count() })
		.from(chordChangeRecord)
		.where(
			and(
				eq(chordChangeRecord.profileId, profileId),
				eq(chordChangeRecord.chordA, chordA),
				eq(chordChangeRecord.chordB, chordB)
			)
		)
		.all();
	return {
		chordA,
		chordB,
		best: stats?.best ?? 0,
		tries: stats?.tries ?? 0,
		history: pairHistory(db, profileId, chordA, chordB)
	};
}

/** Saves a result (pair in canonical order) and returns the pair's updated summary. */
export function saveChangeRecord(db: Db, profileId: number, input: ChangeInput): ChangePair {
	const [chordA, chordB] = canonicalPair(input.chordA, input.chordB);
	db.insert(chordChangeRecord).values({ profileId, chordA, chordB, count: input.count }).run();
	return getChangePair(db, profileId, chordA, chordB);
}
