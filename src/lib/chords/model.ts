// Chord model: spellings, voicings and the generated library (open chords + movable barres).
import { midiToFreq, noteToMidi, pitchClass } from '../music/notes.ts';
import { TUNINGS } from '../tuner/tunings.ts';

export type Quality =
	| ''
	| 'm'
	| '7'
	| 'm7'
	| 'maj7'
	| 'm7b5'
	| 'dim'
	| 'dim7'
	| 'sus2'
	| 'sus4'
	| 'add9'
	| '6'
	| '9'
	| '6/9'
	| 'm9'
	| 'maj9'
	| '11'
	| 'm11'
	| '13';

/**
 * Semitones above the root (extensions above the octave folded in: 9 = 2, 11 = 5, 13 = 9);
 * `optional` tones may be left out of a voicing (the 5th; the 9th of an 11 or 13 chord; the 3rd
 * of an 11 chord, which clashes with the 11th).
 */
export const QUALITIES: Record<
	Quality,
	{ label: string; name: string; tones: number[]; optional: number[] }
> = {
	'': { label: 'Major', name: 'major', tones: [0, 4, 7], optional: [] },
	m: { label: 'Minor', name: 'minor', tones: [0, 3, 7], optional: [] },
	'7': { label: '7', name: '7', tones: [0, 4, 7, 10], optional: [7] },
	m7: { label: 'm7', name: 'minor 7', tones: [0, 3, 7, 10], optional: [7] },
	maj7: { label: 'maj7', name: 'major 7', tones: [0, 4, 7, 11], optional: [7] },
	m7b5: { label: 'm7♭5', name: 'half-diminished', tones: [0, 3, 6, 10], optional: [] },
	dim: { label: 'dim', name: 'diminished', tones: [0, 3, 6], optional: [] },
	dim7: { label: 'dim7', name: 'diminished 7', tones: [0, 3, 6, 9], optional: [] },
	sus2: { label: 'sus2', name: 'sus 2', tones: [0, 2, 7], optional: [] },
	sus4: { label: 'sus4', name: 'sus 4', tones: [0, 5, 7], optional: [] },
	add9: { label: 'add9', name: 'add 9', tones: [0, 2, 4, 7], optional: [7] },
	'6': { label: '6', name: '6', tones: [0, 4, 7, 9], optional: [7] },
	'9': { label: '9', name: '9', tones: [0, 4, 7, 10, 2], optional: [7] },
	'6/9': { label: '6/9', name: '6 9', tones: [0, 4, 7, 9, 2], optional: [7] },
	m9: { label: 'm9', name: 'minor 9', tones: [0, 3, 7, 10, 2], optional: [7] },
	maj9: { label: 'maj9', name: 'major 9', tones: [0, 4, 7, 11, 2], optional: [7] },
	'11': { label: '11', name: '11', tones: [0, 4, 7, 10, 2, 5], optional: [4, 7, 2] },
	m11: { label: 'm11', name: 'minor 11', tones: [0, 3, 7, 10, 2, 5], optional: [7, 2] },
	'13': { label: '13', name: '13', tones: [0, 4, 7, 10, 2, 9], optional: [7, 2] }
};

/** Display order (object keys would put the numeric-looking "7" first). */
export const QUALITY_ORDER: Quality[] = [
	'',
	'm',
	'7',
	'm7',
	'maj7',
	'm7b5',
	'dim',
	'dim7',
	'sus2',
	'sus4',
	'add9',
	'6',
	'9',
	'6/9',
	'm9',
	'maj9',
	'11',
	'm11',
	'13'
];

/**
 * Other spellings of a quality suffix ("Cmin7", "Bø", "C°7", "CΔ", "C69"): the canonical suffix.
 * Case matters ("M7" is maj7, "m7" is minor 7).
 */
export const QUALITY_ALIASES: Record<string, Quality> = {
	maj: '',
	major: '',
	M: '',
	min: 'm',
	mi: 'm',
	minor: 'm',
	'-': 'm',
	dom7: '7',
	min7: 'm7',
	mi7: 'm7',
	'-7': 'm7',
	M7: 'maj7',
	Maj7: 'maj7',
	ma7: 'maj7',
	Δ: 'maj7',
	Δ7: 'maj7',
	'm7-5': 'm7b5',
	'm7♭5': 'm7b5',
	'-7b5': 'm7b5',
	min7b5: 'm7b5',
	ø: 'm7b5',
	ø7: 'm7b5',
	'°': 'dim',
	o: 'dim',
	'°7': 'dim7',
	o7: 'dim7',
	sus: 'sus4',
	add2: 'add9',
	'69': '6/9',
	'6add9': '6/9',
	min9: 'm9',
	'-9': 'm9',
	M9: 'maj9',
	Maj9: 'maj9',
	Δ9: 'maj9',
	min11: 'm11',
	'-11': 'm11'
};

const isQuality = (s: string): s is Quality => Object.hasOwn(QUALITIES, s);

/** The canonical quality of a chord-name suffix ("min7" -> m7, "ø" -> m7b5), or null. */
export function parseQuality(suffix: string): Quality | null {
	if (isQuality(suffix)) return suffix;
	return Object.hasOwn(QUALITY_ALIASES, suffix) ? QUALITY_ALIASES[suffix] : null;
}

export const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
export type Root = (typeof ROOTS)[number];

/** 0 = no finger (open/muted), 1 index, 2 middle, 3 ring, 4 pinky. */
export type FingerNo = 0 | 1 | 2 | 3 | 4;
export type Barre = { fret: number; from: number; to: number };
/** Root string of a movable shape: 6th (E), 5th (A) or 4th (D). */
export type ShapeRoot = 'E' | 'A' | 'D';

export type Voicing = {
	/**
	 * Stable within its chord (the frets, e.g. "3-2-0-0-0-3"): lessons reference voicings by id,
	 * never by position, so reordering or the MAX_VOICINGS cut can't change what they point at.
	 */
	id: string;
	/**
	 * Curated open-position form, or a movable shape (a barre form, or a closed shape such as a
	 * shell). Open voicings come first.
	 */
	kind: 'open' | 'barre';
	/** Low (6th) string first; null = muted, 0 = open. */
	frets: (number | null)[];
	fingers: FingerNo[];
	barre?: Barre;
	label?: string;
};

export type Chord = {
	/** Canonical name, e.g. "C#m" (one spelling per root: see ROOTS). */
	id: string;
	/** URL-safe name for routes and lesson references, e.g. "c-sharp-m". */
	slug: string;
	root: Root;
	quality: Quality;
	/** Slash chords ("G/F#"): the bass note under the chord. */
	bass?: Root;
	voicings: Voicing[];
};

export type OpenChordSource = {
	root: Root;
	quality: Quality;
	/** A slash chord's bass note ("G/B": bass B). */
	bass?: Root;
	voicings: {
		/** Low to high, one character per string ("x32010"), or dash-separated ("x-3-5-4-5-x"). */
		frets: string;
		fingers: string;
		barre?: Barre;
		label?: string;
		/** A closed, movable form (no open strings): listed with the barre shapes. */
		movable?: boolean;
	}[];
};

export type MovableShape = {
	/** The string the root is on: E (6th), A (5th) or D (4th). */
	shape: ShapeRoot;
	quality: Quality;
	/** Offsets from the root's fret (null = muted; -1 = a fret below it). */
	frets: (number | null)[];
	fingers: FingerNo[];
	/** false: no index barre (a shell or a closed shape). Default: barre at the root's fret. */
	barre?: false;
	/** Diagram label (default "E-shape barre"). */
	label?: string;
};

const STANDARD_TUNING = TUNINGS[0].notes.map(noteToMidi);
export const MAX_VOICINGS = 3;

export const chordId = (root: Root, quality: Quality, bass?: Root) =>
	`${root}${quality}${bass ? `/${bass}` : ''}`;

const noteSlug = (n: Root) =>
	[n[0].toLowerCase(), n[1] === '#' ? 'sharp' : n[1] === 'b' ? 'flat' : ''].filter(Boolean);

/** "c-sharp-m7", "c-6-9", and slash chords "g-over-f-sharp". */
export const chordSlug = (root: Root, quality: Quality, bass?: Root) =>
	[...noteSlug(root), quality.replace('/', '-'), ...(bass ? ['over', ...noteSlug(bass)] : [])]
		.filter(Boolean)
		.join('-');

const canonicalNote = (letter: string, acc: string): Root =>
	ROOTS[pitchClass(letter.toUpperCase() + (acc === '♯' ? '#' : acc === '♭' ? 'b' : acc))];

/**
 * Root and quality of a chord name in any enharmonic spelling ("Db", "A#", "G#m", "dbm7"), with
 * the root in its canonical spelling; null when it isn't a chord name.
 */
export function parseChordName(name: string): { root: Root; quality: Quality; bass?: Root } | null {
	const m = /^([A-Ga-g])([#b♯♭]?)(.*)$/.exec(name.trim());
	if (!m) return null;
	const root = canonicalNote(m[1], m[2]);
	const quality = parseQuality(m[3]);
	if (quality !== null) return { root, quality };
	// A slash chord: "G/F#", "Am/G" (but "C6/9" is a quality, matched above).
	const slash = /^(.*)\/([A-G])([#b♯♭]?)$/.exec(m[3]);
	const q = slash && parseQuality(slash[1]);
	if (!slash || q === null) return null;
	const bass = canonicalNote(slash[2], slash[3]);
	return bass === root ? { root, quality: q } : { root, quality: q, bass };
}

/** Spoken name, e.g. "A minor", "G 7", "F sharp major", "B half-diminished". */
export function chordName(c: Pick<Chord, 'root' | 'quality' | 'bass'>): string {
	const spoken = (n: string) => n.replace('#', ' sharp').replace(/^([A-G])b$/, '$1 flat');
	return `${spoken(c.root)} ${QUALITIES[c.quality].name}${c.bass ? ` over ${spoken(c.bass)}` : ''}`;
}

const voicingId = (frets: Voicing['frets']) => frets.map((f) => f ?? 'x').join('-');

export function parseVoicing(src: OpenChordSource['voicings'][number]): Voicing {
	const frets = (src.frets.includes('-') ? src.frets.split('-') : [...src.frets]).map((c) =>
		c === 'x' ? null : Number(c)
	);
	return {
		id: voicingId(frets),
		kind: src.movable ? 'barre' : 'open',
		frets,
		fingers: [...src.fingers].map((c) => Number(c) as FingerNo),
		...(src.barre && { barre: src.barre }),
		...(src.label && { label: src.label })
	};
}

/** The movable shape played with its root at `fret` (its barre, unless it has none). */
export function placeShape(s: MovableShape, fret: number): Voicing {
	const strings = s.frets.flatMap((f, i) => (f === null ? [] : [i]));
	const frets = s.frets.map((f) => (f === null ? null : f + fret));
	return {
		id: voicingId(frets),
		kind: 'barre',
		frets,
		// A string a shape frets below the root that lands on fret 0 rings open.
		fingers: s.fingers.map((f, i) => (frets[i] ? f : 0)) as FingerNo[],
		...(s.barre !== false && { barre: { fret, from: strings[0], to: 5 } }),
		label: s.label ?? `${s.shape}-shape barre`
	};
}

/** Fret where a shape plays `root` (1-11; fret 0 would be the open chord). */
export function barreFret(shape: ShapeRoot, root: Root): number | null {
	const fret = (pitchClass(root) - pitchClass(shape) + 12) % 12;
	return fret === 0 ? null : fret;
}

export const voicingMidis = (v: Voicing) =>
	v.frets.flatMap((f, i) => (f === null ? [] : [STANDARD_TUNING[i] + f]));

export const voicingFreqs = (v: Voicing) => voicingMidis(v).map(midiToFreq);

/** Spelling problems of a voicing (empty when it matches the chord). */
export function checkVoicing(
	chord: Pick<Chord, 'root' | 'quality' | 'bass'>,
	v: Voicing
): string[] {
	const problems: string[] = [];
	const root = pitchClass(chord.root);
	const q = QUALITIES[chord.quality];
	const allowed = new Set(q.tones.map((t) => (root + t) % 12));
	// A slash chord's bass may be a note outside the chord (G/F#), and it is the lowest note.
	const bass = chord.bass ? pitchClass(chord.bass) : root;
	allowed.add(bass);
	const midis = voicingMidis(v);
	const played = new Set(midis.map((m) => m % 12));
	if (v.frets.length !== 6 || v.fingers.length !== 6) problems.push('needs 6 strings');
	for (const pc of played) if (!allowed.has(pc)) problems.push(`stray note (pitch class ${pc})`);
	for (const t of q.tones) {
		if (!q.optional.includes(t) && !played.has((root + t) % 12))
			problems.push(`missing chord tone +${t}`);
	}
	if (midis.length && Math.min(...midis) % 12 !== bass)
		problems.push(chord.bass ? `bass note is not ${chord.bass}` : 'bass note is not the root');
	if (v.frets.some((f) => f !== null && (f < 0 || f > 15))) problems.push('fret out of range');
	v.frets.forEach((f, i) => {
		const finger = v.fingers[i];
		if ((f === null || f === 0) && finger !== 0) problems.push(`finger on open/muted string ${i}`);
		if (f !== null && f > 0 && finger === 0)
			problems.push(`no finger for fret ${f} on string ${i}`);
	});
	if (v.barre) {
		const { fret, from, to } = v.barre;
		for (let i = from; i <= to; i++) {
			const f = v.frets[i];
			if (f !== null && f < fret) problems.push(`string ${i} below the barre`);
		}
	}
	return problems;
}

/** All chords: curated open voicings first, then barre forms (lowest first), max 3 each. */
export function buildLibrary(open: OpenChordSource[], shapes: MovableShape[]): Chord[] {
	const byId = new Map<string, Chord>();
	const get = (root: Root, quality: Quality, bass?: Root) => {
		const id = chordId(root, quality, bass);
		let c = byId.get(id);
		if (!c)
			byId.set(
				id,
				(c = {
					id,
					slug: chordSlug(root, quality, bass),
					root,
					quality,
					...(bass && { bass }),
					voicings: []
				})
			);
		return c;
	};
	for (const src of open) {
		const chord = get(src.root, src.quality, src.bass);
		chord.voicings.push(...src.voicings.map(parseVoicing));
		// Curated movable forms after the open ones.
		chord.voicings.sort((a, b) => +(a.kind === 'barre') - +(b.kind === 'barre'));
	}
	for (const root of ROOTS) {
		const barres = shapes
			.flatMap((s) => {
				const fret = barreFret(s.shape, root);
				// A shape that would need a fret below the nut does not fit at this root.
				if (fret === null || s.frets.some((f) => f !== null && f + fret < 0)) return [];
				return [{ q: s.quality, fret, v: placeShape(s, fret) }];
			})
			.sort((a, b) => a.fret - b.fret);
		for (const { q, v } of barres) {
			const chord = get(root, q);
			if (chord.voicings.length < MAX_VOICINGS && !chord.voicings.some((o) => o.id === v.id))
				chord.voicings.push(v);
		}
	}
	return [...byId.values()].sort(
		(a, b) =>
			ROOTS.indexOf(a.root) - ROOTS.indexOf(b.root) ||
			QUALITY_ORDER.indexOf(a.quality) - QUALITY_ORDER.indexOf(b.quality) ||
			(a.bass ? ROOTS.indexOf(a.bass) + 1 : 0) - (b.bass ? ROOTS.indexOf(b.bass) + 1 : 0)
	);
}
