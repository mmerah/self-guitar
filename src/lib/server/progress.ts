import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { TEMPO_MAX, TEMPO_MIN, type Progress } from '$lib/progress';
import type { Db } from './db';
import { songProgress } from './db/schema';

export const progressInputSchema = z
	.strictObject({
		tempoPct: z.number().int().min(TEMPO_MIN).max(TEMPO_MAX),
		loopStartBar: z.number().int().min(0).nullable(),
		loopEndBar: z.number().int().min(0).nullable(),
		/** true when the user actually started playback (updates max played tempo and last played). */
		played: z.boolean().optional()
	})
	.refine(
		(p) =>
			(p.loopStartBar === null) === (p.loopEndBar === null) &&
			(p.loopStartBar === null || p.loopStartBar <= (p.loopEndBar as number)),
		{ message: 'loop must have both bars set with start <= end, or neither' }
	);

export type ProgressInput = z.infer<typeof progressInputSchema>;

const where = (profileId: number, songId: string) =>
	and(eq(songProgress.profileId, profileId), eq(songProgress.songId, songId));

type Row = typeof songProgress.$inferSelect;

function toProgress(row: Row): Progress {
	return {
		songId: row.songId,
		tempoPct: row.lastTempoPct,
		maxPlayedTempoPct: row.maxPlayedTempoPct,
		lastPlayedAt: row.lastPlayedAt?.toISOString() ?? null,
		loopStartBar: row.loopStartBar,
		loopEndBar: row.loopEndBar
	};
}

export function getProgress(db: Db, profileId: number, songId: string): Progress {
	const row = db.select().from(songProgress).where(where(profileId, songId)).get();
	if (row) return toProgress(row);
	return {
		songId,
		tempoPct: 100,
		maxPlayedTempoPct: null,
		lastPlayedAt: null,
		loopStartBar: null,
		loopEndBar: null
	};
}

export function saveProgress(
	db: Db,
	profileId: number,
	songId: string,
	input: ProgressInput
): Progress {
	const prev = getProgress(db, profileId, songId);
	const values = {
		lastTempoPct: input.tempoPct,
		loopStartBar: input.loopStartBar,
		loopEndBar: input.loopEndBar,
		maxPlayedTempoPct: input.played
			? Math.max(prev.maxPlayedTempoPct ?? 0, input.tempoPct)
			: prev.maxPlayedTempoPct,
		lastPlayedAt: input.played ? new Date() : prev.lastPlayedAt ? new Date(prev.lastPlayedAt) : null
	};
	db.insert(songProgress)
		.values({ profileId, songId, ...values })
		.onConflictDoUpdate({ target: [songProgress.profileId, songProgress.songId], set: values })
		.run();
	return getProgress(db, profileId, songId);
}

/** Progress for every song with saved state, most recently played first. */
export function listProgress(db: Db, profileId: number): Progress[] {
	return db
		.select()
		.from(songProgress)
		.where(eq(songProgress.profileId, profileId))
		.orderBy(sql`${songProgress.lastPlayedAt} desc nulls last`)
		.all()
		.map(toProgress);
}
