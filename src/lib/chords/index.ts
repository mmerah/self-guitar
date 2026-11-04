import { MOVABLE_SHAPES, OPEN_CHORDS } from '../../../content/chords.ts';
import { buildLibrary, chordId, parseChordName, type Chord, type Voicing } from './model.ts';

export * from './model.ts';

export const CHORDS: Chord[] = buildLibrary(OPEN_CHORDS, MOVABLE_SHAPES);
const byId = new Map(CHORDS.map((c) => [c.id, c]));
const bySlug = new Map(CHORDS.map((c) => [c.slug, c]));

/** A chord by canonical id, any enharmonic spelling ("Db" -> C#, "A#" -> Bb) or slug. */
export function getChord(name: string): Chord | undefined {
	// Slugs first: "g-7" is G7's slug, not G with the "-7" (minor 7) suffix.
	const slug = bySlug.get(name);
	if (slug) return slug;
	const parsed = parseChordName(name);
	return (parsed && byId.get(chordId(parsed.root, parsed.quality, parsed.bass))) || undefined;
}

/**
 * Splits a chord reference "F@1-3-3-2-1-1" into the chord name and the voicing id after the "@"
 * (the frets low to high, as /tools/chords shows them); a bare name has no voicing.
 */
export function splitChordRef(ref: string): { name: string; voicing?: string } {
	const at = ref.indexOf('@');
	if (at < 0) return { name: ref.trim() };
	return { name: ref.slice(0, at).trim(), voicing: ref.slice(at + 1).trim() };
}

/**
 * A chord reference with an optional voicing: "G" (its first voicing) or "G@3-2-0-0-3-3" (that
 * voicing); undefined when either is unknown.
 */
export function chordRef(ref: string): { chord: Chord; voicing: Voicing } | undefined {
	const { name, voicing: id } = splitChordRef(ref);
	const chord = getChord(name);
	const voicing = id !== undefined ? chord?.voicings.find((v) => v.id === id) : chord?.voicings[0];
	return chord && voicing ? { chord, voicing } : undefined;
}

/** Why a chord reference does not resolve (unknown chord, or a voicing it lacks); null when it does. */
export function chordRefProblem(ref: string): string | null {
	const { name, voicing } = splitChordRef(ref);
	const chord = getChord(name);
	if (!chord) return `unknown chord "${name}"`;
	if (voicing !== undefined && !chord.voicings.some((v) => v.id === voicing))
		return `chord ${chord.id} has no voicing "${voicing}" (has ${chord.voicings.map((v) => v.id).join(', ')})`;
	return null;
}

/** The canonical form of a reference: "Db@x-4-6-6-6-4" -> "C#@x-4-6-6-6-4" (undefined if unknown). */
export function canonicalChordRef(ref: string): string | undefined {
	const r = chordRef(ref);
	if (!r) return undefined;
	return splitChordRef(ref).voicing !== undefined ? `${r.chord.id}@${r.voicing.id}` : r.chord.id;
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
