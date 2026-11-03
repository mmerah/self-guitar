// Shared by client and server: the shape of 1-minute-changes results.
import { getChord } from './chords/index.ts';
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

/** A chord pair as written in a lesson (names or slugs) as canonical chord ids: [a, b]. */
export function chordIdPair(a: string, b: string): [string, string] {
	return canonicalPair(getChord(a)?.id ?? a, getChord(b)?.id ?? b);
}

/** The pair key of a lesson's changes check (or any pair written with names or slugs). */
export const lessonPairKey = (m: { a: string; b: string }) => chordIdPair(m.a, m.b).join('|');
