// Chord names in chord sheets: aliases ("Amin", "Gmaj7", "D/F#"), canonical spelling, transposing
// and the voicing that plays them. Browser-safe (the sheet view transposes on the client).
import { getChord } from '../chords/index.ts';
import { pitchClass } from '../music/notes.ts';
import { ROOTS, type Chord, type Voicing } from '../chords/model.ts';

/** Suffix aliases → the library's qualities ('' m 7 m7 maj7 sus2 sus4 add9). */
const ALIASES: Record<string, string> = {
	maj: '',
	major: '',
	M: '',
	min: 'm',
	mi: 'm',
	minor: 'm',
	'-': 'm',
	M7: 'maj7',
	Maj7: 'maj7',
	Δ: 'maj7',
	Δ7: 'maj7',
	min7: 'm7',
	mi7: 'm7',
	'-7': 'm7',
	dom7: '7',
	sus: 'sus4',
	add2: 'add9'
};

const NAME_RE = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/;

/** Splits "D/F#" into root "D", suffix "", bass "F#" (null when not a chord-like name). */
function split(name: string) {
	const m = NAME_RE.exec(name.trim());
	return m ? { root: m[1], suffix: m[2], bass: m[3] ?? null } : null;
}

export type SheetChord = {
	/** Canonical name as shown ("Am", "D/F#"). */
	name: string;
	/** The library chord that is fingered and played (the bass of a slash chord is ignored). */
	chord: Chord;
};

/** A chord-sheet chord name in any accepted spelling, or null when the library has no such chord. */
export function resolveChord(name: string): SheetChord | null {
	const s = split(name);
	if (!s) return null;
	const suffix = s.suffix in ALIASES ? ALIASES[s.suffix] : s.suffix;
	const chord = getChord(s.root + suffix);
	if (!chord) return null;
	const bass = s.bass ? ROOTS[pitchClass(s.bass)] : null;
	return { name: bass ? `${chord.id}/${bass}` : chord.id, chord };
}

/** A canonical chord name moved by `semitones` (the library's spelling: C# Eb F# Ab Bb). */
export function transposeChord(name: string, semitones: number): string {
	const n = ((semitones % 12) + 12) % 12;
	if (!n) return name;
	const s = split(name);
	if (!s) return name;
	const move = (root: string) => ROOTS[(pitchClass(root) + n) % 12];
	return `${move(s.root)}${s.suffix}${s.bass ? `/${move(s.bass)}` : ''}`;
}

/** "B minor" for "Bm" / "G major" for "G". */
export function keyName(key: string): string {
	const s = split(key);
	if (!s) return key;
	return `${s.root} ${s.suffix.startsWith('m') ? 'minor' : 'major'}`;
}

/**
 * The voicing a (possibly transposed) chord plays: a pinned voicing id when given, else the
 * library's first; a chord the library lacks falls back to its plain major/minor triad.
 */
export function voicingFor(
	name: string,
	pinned?: string
): { chord: Chord; voicing: Voicing } | null {
	const r = resolveChord(name);
	const chord = r?.chord ?? fallback(name);
	if (!chord) return null;
	const voicing = (pinned && chord.voicings.find((v) => v.id === pinned)) || chord.voicings[0];
	return voicing ? { chord, voicing } : null;
}

function fallback(name: string): Chord | undefined {
	const s = split(name);
	if (!s) return undefined;
	const minor = /^m(?!aj)/.test(s.suffix);
	return getChord(s.root + (minor ? 'm' : ''));
}
