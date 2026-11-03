import { MOVABLE_SHAPES, OPEN_CHORDS } from '../../../content/chords.ts';
import { buildLibrary, chordId, parseChordName, type Chord, type Voicing } from './model.ts';

export * from './model.ts';

export const CHORDS: Chord[] = buildLibrary(OPEN_CHORDS, MOVABLE_SHAPES);
const byId = new Map(CHORDS.map((c) => [c.id, c]));
const bySlug = new Map(CHORDS.map((c) => [c.slug, c]));

/** A chord by canonical id, any enharmonic spelling ("Db" -> C#, "A#" -> Bb) or slug. */
export function getChord(name: string): Chord | undefined {
	const parsed = parseChordName(name);
	return (parsed && byId.get(chordId(parsed.root, parsed.quality))) || bySlug.get(name);
}

/**
 * A chord reference with an optional voicing: "G" (its first voicing) or "G 3-2-0-0-3-3" (that
 * voicing id); undefined when either is unknown.
 */
export function chordRef(ref: string): { chord: Chord; voicing: Voicing } | undefined {
	const [name, id] = ref.trim().split(/\s+/);
	const chord = getChord(name);
	const voicing = id ? chord?.voicings.find((v) => v.id === id) : chord?.voicings[0];
	return chord && voicing ? { chord, voicing } : undefined;
}

/**
 * Chords for beginners' 1-minute changes, in teaching order: open chords, then Bm (the first
 * barre chord most courses teach).
 */
export const CHANGE_CHORDS = [
	'A',
	'D',
	'E',
	'Em',
	'Am',
	'C',
	'G',
	'Dm',
	'E7',
	'A7',
	'D7',
	'G7',
	'C7',
	'B7',
	'F',
	'Fmaj7',
	'Cadd9',
	'Em7',
	'Am7',
	'Bm'
];
