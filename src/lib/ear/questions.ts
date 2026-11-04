// One ear-training question as notes to play (MIDI), pure: an interval in a direction, a chord, a
// progression in a key. Ranges stay where an acoustic guitar sounds (E2 … about E5).
import { pcOf } from '../theory/notes.ts';
import { chordSemis, diatonic, intervalById, type ChordType } from '../theory/scales.ts';
import type { EarDir } from './items.ts';
import type { Rng } from './trainer.ts';

const pick = <T>(xs: readonly T[], rng: Rng) => xs[Math.floor(rng() * xs.length) % xs.length];
const between = (lo: number, hi: number, rng: Rng) => lo + Math.floor(rng() * (hi - lo + 1));

export type IntervalQuestion = {
	kind: 'intervals';
	item: string;
	dir: Exclude<EarDir, 'mixed'>;
	/** Notes in playing order (both at once when harmonic). */
	notes: number[];
	/** The lower note (the reference). */
	low: number;
};

export function intervalQuestion(item: string, dir: EarDir, rng: Rng): IntervalQuestion {
	const semis = intervalById(item)?.semis ?? 7;
	const d = dir === 'mixed' ? pick(['asc', 'desc', 'harm'] as const, rng) : dir;
	const low = between(48, 60, rng); // C3 … C4
	const high = low + semis;
	return { kind: 'intervals', item, dir: d, notes: d === 'desc' ? [high, low] : [low, high], low };
}

export type ChordQuestion = { kind: 'chords'; item: string; root: number; notes: number[] };

/** A close-position chord on a root between A2 and E3 (root, 3rd, 5th, 7th upwards). */
export function chordQuestion(item: string, rng: Rng): ChordQuestion {
	const root = between(45, 52, rng);
	const notes = chordSemis(item as ChordType).map((s) => root + s);
	// The root an octave up as well: a fuller, guitar-like spread.
	return { kind: 'chords', item, root, notes: [...notes, root + 12].sort((a, b) => a - b) };
}

export type ProgressionChord = { numeral: string; symbol: string; notes: number[] };
export type ProgressionQuestion = {
	kind: 'progressions';
	key: string;
	/** Chord 1 is always I; chords 2–4 are the questions. */
	chords: ProgressionChord[];
};

/**
 * Voices a diatonic chord: the root in the bass (E2–D#3), the triad above it between G3 and
 * F#4 (the nearest notes, so chords move smoothly like a guitarist's voicings).
 */
export function voiceChord(key: string, numeral: string): ProgressionChord {
	const chord = diatonic(key).find((c) => c.numeral === numeral)!;
	const rootPc = (pcOf(key) + chord.semis) % 12;
	const bass = 40 + ((rootPc - 4 + 12) % 12);
	const upper = chordSemis(chord.type).map((s) => {
		const pc = (rootPc + s) % 12;
		return 55 + ((pc - 7 + 12) % 12);
	});
	return {
		numeral,
		symbol: chord.symbol,
		notes: [bass, ...upper.sort((a, b) => a - b)]
	};
}

export function progressionQuestion(key: string, numerals: string[]): ProgressionQuestion {
	return { kind: 'progressions', key, chords: ['I', ...numerals].map((n) => voiceChord(key, n)) };
}

/** A note to find on the guitar (playback drill): a natural note between E2 and E4. */
export function playbackNote(item: string, rng: Rng): number {
	const pc = pcOf(item);
	const options = [
		40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63,
		64
	].filter((m) => m % 12 === pc);
	return pick(options, rng);
}
