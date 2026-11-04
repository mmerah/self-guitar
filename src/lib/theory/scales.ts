// Intervals, scale and chord formulas, and diatonic harmony. Formulas are interval tokens (see
// ./notes), so every note is spelled correctly in every key.
import { keyUsesFlats, parseToken, spell } from './notes.ts';

// ---- intervals ------------------------------------------------------------------------------------

export type IntervalId =
	'm2' | 'M2' | 'm3' | 'M3' | 'P4' | 'TT' | 'P5' | 'm6' | 'M6' | 'm7' | 'M7' | 'P8';

export type Interval = { id: IntervalId; semis: number; token: string; name: string };

/** m2 … P8, smallest first. `token` is the formula token for the upper note. */
export const INTERVALS: Interval[] = [
	{ id: 'm2', semis: 1, token: 'b2', name: 'Minor 2nd' },
	{ id: 'M2', semis: 2, token: '2', name: 'Major 2nd' },
	{ id: 'm3', semis: 3, token: 'b3', name: 'Minor 3rd' },
	{ id: 'M3', semis: 4, token: '3', name: 'Major 3rd' },
	{ id: 'P4', semis: 5, token: '4', name: 'Perfect 4th' },
	{ id: 'TT', semis: 6, token: 'b5', name: 'Tritone' },
	{ id: 'P5', semis: 7, token: '5', name: 'Perfect 5th' },
	{ id: 'm6', semis: 8, token: 'b6', name: 'Minor 6th' },
	{ id: 'M6', semis: 9, token: '6', name: 'Major 6th' },
	{ id: 'm7', semis: 10, token: 'b7', name: 'Minor 7th' },
	{ id: 'M7', semis: 11, token: '7', name: 'Major 7th' },
	{ id: 'P8', semis: 12, token: '8', name: 'Octave' }
];
export const INTERVAL_IDS = INTERVALS.map((i) => i.id);
export const intervalById = (id: string) => INTERVALS.find((i) => i.id === id);

/** The simple interval between two MIDI notes (direction ignored; compound folded, octave kept). */
export function intervalBetween(a: number, b: number): Interval | undefined {
	const d = Math.abs(b - a);
	const semis = d === 0 ? 0 : d % 12 === 0 ? 12 : d % 12;
	return INTERVALS.find((i) => i.semis === semis);
}

// ---- scales ---------------------------------------------------------------------------------------

export const SCALES = {
	major: { name: 'Major', tokens: ['1', '2', '3', '4', '5', '6', '7'] },
	'natural-minor': { name: 'Natural minor', tokens: ['1', '2', 'b3', '4', '5', 'b6', 'b7'] },
	'major-pentatonic': { name: 'Major pentatonic', tokens: ['1', '2', '3', '5', '6'] },
	'minor-pentatonic': { name: 'Minor pentatonic', tokens: ['1', 'b3', '4', '5', 'b7'] },
	blues: { name: 'Blues', tokens: ['1', 'b3', '4', 'b5', '5', 'b7'] },
	ionian: { name: 'Ionian', tokens: ['1', '2', '3', '4', '5', '6', '7'] },
	dorian: { name: 'Dorian', tokens: ['1', '2', 'b3', '4', '5', '6', 'b7'] },
	phrygian: { name: 'Phrygian', tokens: ['1', 'b2', 'b3', '4', '5', 'b6', 'b7'] },
	lydian: { name: 'Lydian', tokens: ['1', '2', '3', '#4', '5', '6', '7'] },
	mixolydian: { name: 'Mixolydian', tokens: ['1', '2', '3', '4', '5', '6', 'b7'] },
	aeolian: { name: 'Aeolian', tokens: ['1', '2', 'b3', '4', '5', 'b6', 'b7'] },
	locrian: { name: 'Locrian', tokens: ['1', 'b2', 'b3', '4', 'b5', 'b6', 'b7'] }
} as const satisfies Record<string, { name: string; tokens: string[] }>;
export type ScaleId = keyof typeof SCALES;
export const SCALE_IDS = Object.keys(SCALES) as ScaleId[];
export const isScale = (id: string): id is ScaleId => id in SCALES;
/** Scales written with the key signature of a minor key (for sharps/flats). */
const MINORISH: ScaleId[] = [
	'natural-minor',
	'minor-pentatonic',
	'blues',
	'dorian',
	'phrygian',
	'aeolian',
	'locrian'
];
export const isMinorScale = (id: ScaleId) => MINORISH.includes(id);

/** The scale's notes from the root, spelled in its key: scaleNotes('F', 'major') has Bb. */
export const scaleNotes = (root: string, id: ScaleId): string[] =>
	SCALES[id].tokens.map((t) => spell(root, t));

// ---- chords ---------------------------------------------------------------------------------------

export const CHORD_TYPES = {
	major: { name: 'Major', symbol: '', tokens: ['1', '3', '5'] },
	minor: { name: 'Minor', symbol: 'm', tokens: ['1', 'b3', '5'] },
	dim: { name: 'Diminished', symbol: 'dim', tokens: ['1', 'b3', 'b5'] },
	aug: { name: 'Augmented', symbol: 'aug', tokens: ['1', '3', '#5'] },
	sus2: { name: 'sus2', symbol: 'sus2', tokens: ['1', '2', '5'] },
	sus4: { name: 'sus4', symbol: 'sus4', tokens: ['1', '4', '5'] },
	'7': { name: 'Dominant 7', symbol: '7', tokens: ['1', '3', '5', 'b7'] },
	maj7: { name: 'Major 7', symbol: 'maj7', tokens: ['1', '3', '5', '7'] },
	m7: { name: 'Minor 7', symbol: 'm7', tokens: ['1', 'b3', '5', 'b7'] },
	m7b5: { name: 'Half-diminished', symbol: 'm7b5', tokens: ['1', 'b3', 'b5', 'b7'] },
	dim7: { name: 'Diminished 7', symbol: 'dim7', tokens: ['1', 'b3', 'b5', 'bb7'] },
	add9: { name: 'add9', symbol: 'add9', tokens: ['1', '3', '5', '9'] },
	'6': { name: 'Major 6', symbol: '6', tokens: ['1', '3', '5', '6'] },
	'9': { name: 'Dominant 9', symbol: '9', tokens: ['1', '3', '5', 'b7', '9'] }
} as const satisfies Record<string, { name: string; symbol: string; tokens: string[] }>;
export type ChordType = keyof typeof CHORD_TYPES;
export const CHORD_TYPE_IDS = Object.keys(CHORD_TYPES) as ChordType[];
export const isChordType = (id: string): id is ChordType => id in CHORD_TYPES;

/** Semitones above the root of each chord tone (compound tones keep their octave). */
export const chordSemis = (type: ChordType) =>
	CHORD_TYPES[type].tokens.map((t) => parseToken(t).semis);
export const chordNotes = (root: string, type: ChordType) =>
	CHORD_TYPES[type].tokens.map((t) => spell(root, t));
export const chordSymbol = (root: string, type: ChordType) => root + CHORD_TYPES[type].symbol;

// ---- diatonic harmony --------------------------------------------------------------------------

export const NUMERALS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'viio'] as const;
export type Numeral = (typeof NUMERALS)[number];
const NUMERAL_TYPE: ChordType[] = ['major', 'minor', 'minor', 'major', 'major', 'minor', 'dim'];
const NUMERAL_7TH: ChordType[] = ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5'];
/** "viio" -> "vii°" (display). */
export const numeralLabel = (n: string) => n.replace(/o$/, '°');

export type DiatonicChord = {
	numeral: Numeral;
	root: string;
	type: ChordType;
	symbol: string;
	/** Semitones of the chord's root above the key's tonic. */
	semis: number;
};

/** The seven chords of a major key (triads, or seventh chords): diatonic('G') has Em and D. */
export function diatonic(key: string, sevenths = false): DiatonicChord[] {
	const tokens = SCALES.major.tokens;
	return NUMERALS.map((numeral, i) => {
		const root = spell(key, tokens[i]);
		const type = (sevenths ? NUMERAL_7TH : NUMERAL_TYPE)[i];
		return {
			numeral,
			root,
			type,
			symbol: chordSymbol(root, type),
			semis: parseToken(tokens[i]).semis
		};
	});
}

/** Whether a major key is written with flats. */
export const majorKeyFlats = (key: string) => keyUsesFlats(key, false);
