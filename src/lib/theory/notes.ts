// Note spelling: letters, accidentals, interval tokens ("b3", "#4", "9") and key-aware names.
// Pitch classes and MIDI come from $lib/music/notes; this adds the *spelling* that theory needs
// (A minor pentatonic is A C D E G, F major has Bb not A#).
import { pitchClass } from '../music/notes.ts';

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export type Letter = (typeof LETTERS)[number];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
/** One spelling per pitch class for pickers: the usual key names. */
export const ROOT_NAMES = [
	'C',
	'Db',
	'D',
	'Eb',
	'E',
	'F',
	'F#',
	'G',
	'Ab',
	'A',
	'Bb',
	'B'
] as const;
/** The seven natural notes. */
export const NATURALS = LETTERS;

const NOTE_RE = /^([A-G])(##|bb|#|b)?$/;

export const isNoteName = (name: string) => NOTE_RE.test(name);

/** Letter index (C = 0 … B = 6) and accidental (-2..2) of a name such as "Eb" or "F##". */
export function parseName(name: string): { letter: number; acc: number } {
	const m = NOTE_RE.exec(name);
	if (!m) throw new Error(`Bad note name: ${name}`);
	const acc = { '': 0, '#': 1, '##': 2, b: -1, bb: -2 }[m[2] ?? ''] as number;
	return { letter: LETTERS.indexOf(m[1] as Letter), acc };
}

/** Pitch class (0 = C) of any spelling, double accidentals included. */
export function pcOf(name: string): number {
	const m = NOTE_RE.exec(name);
	if (m && (m[2] === '##' || m[2] === 'bb')) {
		const { letter, acc } = parseName(name);
		return (((LETTER_PC[letter] + acc) % 12) + 12) % 12;
	}
	return pitchClass(name);
}

/** The name of a pitch class, with sharps or flats. */
export const pcName = (pc: number, flats = false) =>
	(flats ? FLATS : SHARPS)[((pc % 12) + 12) % 12];

/** Two names for the same sound ("F#" and "Gb"). */
export const enharmonic = (a: string, b: string) => pcOf(a) === pcOf(b);

/** The plain spelling of an awkward one: "E#" -> "F", "Cb" -> "B", "Bbb" -> "A". */
export function simplify(name: string, flats = name.includes('b')): string {
	const { acc } = parseName(name);
	if (Math.abs(acc) <= 1) {
		const pc = pcOf(name);
		// A single accidental that lands on a natural (E#, Fb, B#, Cb) becomes that natural.
		if (acc !== 0 && LETTER_PC.includes(pc)) return LETTERS[LETTER_PC.indexOf(pc)];
		return name;
	}
	return pcName(pcOf(name), flats);
}

/** "F#" -> "F♯", "Bb" -> "B♭" (display only). */
export const pretty = (name: string) =>
	name.replace(
		/^([A-G])(.*)$/,
		(_, l: string, acc: string) => l + acc.replace(/##/g, '𝄪').replace(/#/g, '♯').replace(/b/g, '♭')
	);

// ---- interval tokens --------------------------------------------------------------------------

/** Natural semitones of each scale degree (1-based; 9, 11, 13 are compound). */
const DEGREE_SEMIS: Record<number, number> = {
	1: 0,
	2: 2,
	3: 4,
	4: 5,
	5: 7,
	6: 9,
	7: 11,
	8: 12,
	9: 14,
	11: 17,
	13: 21
};
const TOKEN_RE = /^(bb|b|#)?(1|2|3|4|5|6|7|8|9|11|13)$/;

/** A formula token ("1", "b3", "#4", "bb7", "9") as its degree and semitones above the root. */
export function parseToken(token: string): { degree: number; semis: number } {
	const m = TOKEN_RE.exec(token);
	if (!m) throw new Error(`Bad interval token: ${token}`);
	const degree = Number(m[2]);
	const acc = { '': 0, '#': 1, b: -1, bb: -2 }[m[1] ?? ''] as number;
	return { degree, semis: DEGREE_SEMIS[degree] + acc };
}

export const isToken = (token: string) => TOKEN_RE.test(token);

/** The label shown on a fretboard dot: "R" for the root, else the token ("b3", "5", "b7"). */
export const tokenLabel = (token: string) =>
	token === '1' || token === '8' ? 'R' : token.replace(/b/g, '♭').replace(/#/g, '♯');

/**
 * The note `token` above `root`, spelled from the letters: spell('F', '4') = 'Bb',
 * spell('E', '3') = 'G#', spell('A', 'b3') = 'C'. Compound degrees fold to the octave.
 */
export function spell(root: string, token: string): string {
	const { letter, acc } = parseName(root);
	const { degree, semis } = parseToken(token);
	const target = (((LETTER_PC[letter] + acc + semis) % 12) + 12) % 12;
	const l = (letter + degree - 1) % 7;
	let diff = (((target - LETTER_PC[l]) % 12) + 12) % 12;
	if (diff > 6) diff -= 12;
	const accText = diff === 0 ? '' : diff > 0 ? '#'.repeat(diff) : 'b'.repeat(-diff);
	return LETTERS[l] + accText;
}

// ---- keys and transposition ---------------------------------------------------------------------

const FLAT_MAJORS = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
const FLAT_MINORS = ['D', 'G', 'C', 'F', 'Bb', 'Eb', 'Ab'];

/** Whether a key is written with flats (F major, D minor…) or sharps (G major, E minor…). */
export function keyUsesFlats(root: string, minor = false): boolean {
	if (root.endsWith('b') && root.length > 1) return true;
	if (root.endsWith('#')) return false;
	return (minor ? FLAT_MINORS : FLAT_MAJORS).includes(root);
}

/** A note moved by semitones, spelled with the key's accidentals (or sharps by default). */
export const transposeNote = (name: string, semitones: number, flats = false) =>
	pcName(pcOf(name) + semitones, flats);

/** A chord symbol moved by semitones ("F#m7" + 2 -> "G#m7"); null when it isn't a chord name. */
export function transposeSymbol(symbol: string, semitones: number, flats = false): string | null {
	const m = /^([A-G](?:#|b)?)(.*?)(?:\/([A-G](?:#|b)?))?$/.exec(symbol);
	if (!m) return null;
	const bass = m[3] ? `/${transposeNote(m[3], semitones, flats)}` : '';
	return transposeNote(m[1], semitones, flats) + m[2] + bass;
}

/** Semitones from one note up to the next (0..11). */
export const semitonesUp = (from: string, to: string) => (((pcOf(to) - pcOf(from)) % 12) + 12) % 12;
