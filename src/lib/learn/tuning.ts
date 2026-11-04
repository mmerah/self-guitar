// The tuning an exercise's score asks for (`\tuning (D4 A3 G3 D3 A2 D2)`, alphaTex lists the strings
// high to low): matched against the tuner's presets so the exercise page can say "retune first"
// and link the tuner set to it. Browser-safe (no alphaTab).
import { noteToMidi } from '../music/notes.ts';
import { TUNINGS, type Tuning } from '../tuner/tunings.ts';

const TUNING_RE = /^\s*\\tuning\s*\(?([^)\n]*)\)?/m;
const NOTE_RE = /^[A-Ga-g][#b]?-?\d$/;

/** The notes of a score's `\tuning`, low string first; null when the score keeps standard tuning. */
export function scoreTuningNotes(tex: string): string[] | null {
	const src = tex.replace(/^\s*\/\/.*$/gm, '');
	const m = TUNING_RE.exec(src);
	if (!m) return null;
	return m[1]
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((n) => n[0].toUpperCase() + n.slice(1))
		.reverse();
}

/**
 * The tuner preset a score is written for: standard when it sets no `\tuning`; `unknown` when it
 * sets one the tuner has no preset for (content:check rejects that).
 */
export function scoreTuning(tex: string): Tuning | 'unknown' {
	const notes = scoreTuningNotes(tex);
	if (!notes) return TUNINGS[0];
	if (notes.length !== 6 || !notes.every((n) => NOTE_RE.test(n))) return 'unknown';
	const midis = notes.map(noteToMidi).join();
	return TUNINGS.find((t) => t.notes.map(noteToMidi).join() === midis) ?? 'unknown';
}

/** A tuning other than standard, for the "Tuning: DADGAD, retune first" notice; else null. */
export function altTuning(tex: string): Tuning | null {
	const t = scoreTuning(tex);
	return t === 'unknown' || t.id === TUNINGS[0].id ? null : t;
}

/** Note names for string labels, sharp-preferred as tunings are named (open D: D A D F♯ A D). */
export const TUNING_NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];

/** A tuning note ("F#3") as shown: no octave, ♯/♭ ("F♯"). */
export const tuningNoteLabel = (note: string) =>
	note
		.replace(/-?\d$/, '')
		.replace('#', '♯')
		.replace(/(?<=^[A-G])b/, '♭');
