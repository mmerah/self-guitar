// Shared by client and server: the shape of 1-minute-changes results.
export type ChangeRecord = { count: number; createdAt: string };

export type ChangePair = {
	chordA: string;
	chordB: string;
	best: number;
	/** Number of results recorded for the pair. */
	tries: number;
	/** Oldest first, at most HISTORY_LIMIT entries. */
	history: ChangeRecord[];
};

export const HISTORY_LIMIT = 30;
export const MAX_CHANGES = 300;

/** Chord pairs are stored and compared in one canonical order, so "G–C" and "C–G" are one pair. */
export function canonicalPair(a: string, b: string): [string, string] {
	return a < b ? [a, b] : [b, a];
}

export const pairKey = (a: string, b: string) => canonicalPair(a, b).join('|');
