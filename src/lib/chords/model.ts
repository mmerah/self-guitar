// Chord model: spellings, voicings and the generated library (open chords + movable barres).
import { midiToFreq, noteToMidi, pitchClass } from '../music/notes.ts';
import { TUNINGS } from '../tuner/tunings.ts';

export type Quality = '' | 'm' | '7' | 'm7' | 'maj7' | 'sus2' | 'sus4' | 'add9';

/** Semitones above the root; `optional` tones may be left out of a voicing (the 5th). */
export const QUALITIES: Record<Quality, { label: string; tones: number[]; optional: number[] }> = {
	'': { label: 'Major', tones: [0, 4, 7], optional: [] },
	m: { label: 'Minor', tones: [0, 3, 7], optional: [] },
	'7': { label: '7', tones: [0, 4, 7, 10], optional: [7] },
	m7: { label: 'm7', tones: [0, 3, 7, 10], optional: [7] },
	maj7: { label: 'maj7', tones: [0, 4, 7, 11], optional: [7] },
	sus2: { label: 'sus2', tones: [0, 2, 7], optional: [] },
	sus4: { label: 'sus4', tones: [0, 5, 7], optional: [] },
	add9: { label: 'add9', tones: [0, 2, 4, 7], optional: [7] }
};

/** Display order (object keys would put the numeric-looking "7" first). */
export const QUALITY_ORDER: Quality[] = ['', 'm', '7', 'm7', 'maj7', 'sus2', 'sus4', 'add9'];

export const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
export type Root = (typeof ROOTS)[number];

/** 0 = no finger (open/muted), 1 index, 2 middle, 3 ring, 4 pinky. */
export type FingerNo = 0 | 1 | 2 | 3 | 4;
export type Barre = { fret: number; from: number; to: number };

export type Voicing = {
	/**
	 * Stable within its chord (the frets, e.g. "3-2-0-0-0-3"): lessons reference voicings by id,
	 * never by position, so reordering or the MAX_VOICINGS cut can't change what they point at.
	 */
	id: string;
	/** Curated open-position form, or a movable barre shape. Open voicings come first. */
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
	voicings: Voicing[];
};

export type OpenChordSource = {
	root: Root;
	quality: Quality;
	voicings: { frets: string; fingers: string; barre?: Barre; label?: string }[];
};

export type MovableShape = {
	shape: 'E' | 'A';
	quality: Quality;
	frets: (number | null)[];
	fingers: FingerNo[];
};

const STANDARD_TUNING = TUNINGS[0].notes.map(noteToMidi);
export const MAX_VOICINGS = 3;

export const chordId = (root: Root, quality: Quality) => `${root}${quality}`;

export const chordSlug = (root: Root, quality: Quality) =>
	[root[0].toLowerCase(), root[1] === '#' ? 'sharp' : root[1] === 'b' ? 'flat' : '', quality]
		.filter(Boolean)
		.join('-');

/**
 * Root and quality of a chord name in any enharmonic spelling ("Db", "A#", "G#m", "dbm7"), with
 * the root in its canonical spelling; null when it isn't a chord name.
 */
export function parseChordName(name: string): { root: Root; quality: Quality } | null {
	const m = /^([A-Ga-g])([#b]?)(.*)$/.exec(name.trim());
	if (!m || !(m[3] in QUALITIES)) return null;
	const pc = pitchClass(m[1].toUpperCase() + m[2]);
	return { root: ROOTS[pc], quality: m[3] as Quality };
}

/** Spoken name, e.g. "A minor", "G 7", "F sharp major". */
export function chordName(c: Pick<Chord, 'root' | 'quality'>): string {
	const root = c.root.replace('#', ' sharp').replace(/^([A-G])b$/, '$1 flat');
	return `${root} ${QUALITIES[c.quality].label.toLowerCase()}`;
}

const voicingId = (frets: Voicing['frets']) => frets.map((f) => f ?? 'x').join('-');

export function parseVoicing(src: OpenChordSource['voicings'][number]): Voicing {
	const frets = [...src.frets].map((c) => (c === 'x' ? null : Number(c)));
	return {
		id: voicingId(frets),
		kind: 'open',
		frets,
		fingers: [...src.fingers].map((c) => Number(c) as FingerNo),
		...(src.barre && { barre: src.barre }),
		...(src.label && { label: src.label })
	};
}

/** The movable shape played with its barre at `fret`. */
export function placeShape(s: MovableShape, fret: number): Voicing {
	const strings = s.frets.flatMap((f, i) => (f === null ? [] : [i]));
	const frets = s.frets.map((f) => (f === null ? null : f + fret));
	return {
		id: voicingId(frets),
		kind: 'barre',
		frets,
		fingers: s.fingers,
		barre: { fret, from: strings[0], to: 5 },
		label: `${s.shape}-shape barre`
	};
}

/** Barre fret where a shape plays `root` (1-11; fret 0 would be the open chord). */
export function barreFret(shape: 'E' | 'A', root: Root): number | null {
	const fret = (pitchClass(root) - pitchClass(shape) + 12) % 12;
	return fret === 0 ? null : fret;
}

export const voicingMidis = (v: Voicing) =>
	v.frets.flatMap((f, i) => (f === null ? [] : [STANDARD_TUNING[i] + f]));

export const voicingFreqs = (v: Voicing) => voicingMidis(v).map(midiToFreq);

/** Spelling problems of a voicing (empty when it matches the chord). */
export function checkVoicing(chord: Pick<Chord, 'root' | 'quality'>, v: Voicing): string[] {
	const problems: string[] = [];
	const root = pitchClass(chord.root);
	const q = QUALITIES[chord.quality];
	const allowed = new Set(q.tones.map((t) => (root + t) % 12));
	const midis = voicingMidis(v);
	const played = new Set(midis.map((m) => m % 12));
	if (v.frets.length !== 6 || v.fingers.length !== 6) problems.push('needs 6 strings');
	for (const pc of played) if (!allowed.has(pc)) problems.push(`stray note (pitch class ${pc})`);
	for (const t of q.tones) {
		if (!q.optional.includes(t) && !played.has((root + t) % 12))
			problems.push(`missing chord tone +${t}`);
	}
	if (midis.length && Math.min(...midis) % 12 !== root) problems.push('bass note is not the root');
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
	const get = (root: Root, quality: Quality) => {
		const id = chordId(root, quality);
		let c = byId.get(id);
		if (!c) byId.set(id, (c = { id, slug: chordSlug(root, quality), root, quality, voicings: [] }));
		return c;
	};
	for (const src of open)
		get(src.root, src.quality).voicings.push(...src.voicings.map(parseVoicing));
	for (const root of ROOTS) {
		const barres = shapes
			.flatMap((s) => {
				const fret = barreFret(s.shape, root);
				return fret === null ? [] : [{ q: s.quality, v: placeShape(s, fret) }];
			})
			.sort((a, b) => a.v.barre!.fret - b.v.barre!.fret);
		for (const { q, v } of barres) {
			const chord = get(root, q);
			if (chord.voicings.length < MAX_VOICINGS && !chord.voicings.some((o) => o.id === v.id))
				chord.voicings.push(v);
		}
	}
	return [...byId.values()].sort(
		(a, b) =>
			ROOTS.indexOf(a.root) - ROOTS.indexOf(b.root) ||
			QUALITY_ORDER.indexOf(a.quality) - QUALITY_ORDER.indexOf(b.quality)
	);
}
