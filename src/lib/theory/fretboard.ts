// The fretboard as data: what is where in standard tuning, and the overlays the explorer and the
// ::fretboard lesson widget draw (scales and their boxes, arpeggios, CAGED shapes, triads on string
// sets, the notes). Strings are numbered like guitarists do: 1 = high e … 6 = low E.
import { NATURALS, isNoteName, isToken, parseToken, pcName, pcOf, spell } from './notes.ts';
import {
	CHORD_TYPES,
	isChordType,
	isScale,
	SCALES,
	type ChordType,
	type ScaleId
} from './scales.ts';

/** Frets drawn by the explorer (0 = open strings). */
export const FRETS = 15;
/**
 * The highest fret a scale box / position may reach: a 3-notes-per-string position starting at
 * fret 10 or 11 on string 6 climbs to fret 16 or 17 (most acoustics have 18+ frets, though the
 * body gets in the way), and one octave lower it would need fret -1 or -2.
 */
export const BOX_MAX_FRET = 17;
export const STRINGS = [1, 2, 3, 4, 5, 6] as const;
/** Open-string MIDI notes, standard tuning (E2 A2 D3 G3 B3 E4). */
export const OPEN_MIDI: Record<number, number> = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
export const STRING_NAMES: Record<number, string> = {
	1: 'e',
	2: 'B',
	3: 'G',
	4: 'D',
	5: 'A',
	6: 'E'
};
/** Fret markers: single dots, and the double dot at 12. */
export const INLAYS = [3, 5, 7, 9, 12, 15, 17];
export const DOUBLE_INLAYS = [12];

export const midiAt = (string: number, fret: number) => OPEN_MIDI[string] + fret;
const mod12 = (n: number) => ((n % 12) + 12) % 12;
/** The fret (0..11) of a pitch class on a string. */
export const fretOf = (pc: number, string: number) => mod12(pc - OPEN_MIDI[string]);

export type LabelMode = 'intervals' | 'notes' | 'fingers' | 'none';
export const LABEL_MODES: LabelMode[] = ['intervals', 'notes', 'fingers', 'none'];
export type Finger = 1 | 2 | 3 | 4;

export type Dot = {
	string: number;
	fret: number;
	midi: number;
	/** Spelled in the key ("Bb" in F major). */
	name: string;
	/** Interval token from the root ("1", "b3", "5"), when there is a root. */
	token?: string;
	root: boolean;
	finger?: Finger;
	/** A colour note outside the base shape (the blues scale's b5). */
	extra?: boolean;
	/** An emphasised degree (`highlight="#4"`, a mode's colour note): its own colour and a ring. */
	accent?: boolean;
};
/** A band behind some frets (a CAGED shape, a triad inversion), with its name. */
export type Region = { from: number; to: number; label: string };

export const CAGED_SHAPES = ['C', 'A', 'G', 'E', 'D'] as const;
export type CagedShape = (typeof CAGED_SHAPES)[number];
export const TRIAD_TYPES = ['major', 'minor', 'dim', 'aug', 'sus2', 'sus4'] as const;
export type TriadType = (typeof TRIAD_TYPES)[number];
/** Adjacent three-string sets for triads (high to low). */
export const STRING_SETS = ['1-3', '2-4', '3-5', '4-6'] as const;

export type FretboardMode = 'scale' | 'chord' | 'caged' | 'triads' | 'note' | 'notes';
export const FRETBOARD_MODES: FretboardMode[] = [
	'scale',
	'chord',
	'caged',
	'triads',
	'note',
	'notes'
];

/** What to draw: one overlay, with its labels, strings and fret window. */
export type FretboardSpec = {
	mode: FretboardMode;
	root?: string;
	scale?: ScaleId;
	/** Arpeggio chord type (mode chord) or triad type (mode triads). */
	chord?: ChordType;
	/** Box / position number (scales): pentatonic boxes 1–5, three-notes-per-string 1–7. */
	box?: number;
	shape?: CagedShape | 'all';
	/** Mode note: every position of this note. */
	note?: string;
	/** Mode notes: the natural notes, or all twelve. */
	notes?: 'naturals' | 'all';
	/** Only these strings (all when absent). */
	strings?: number[];
	/** Only these frets, inclusive (the whole neck when absent). */
	frets?: [number, number];
	labels: LabelMode;
	/** Interval tokens to emphasise ("#4", "b2"). */
	highlight?: string[];
	/** `modes="all"`: one diagram with Ionian…Locrian chips (`scale` is the mode shown). */
	modes?: 'all';
};

export type Overlay = {
	dots: Dot[];
	regions: Region[];
	/** The frets worth showing: the dots' span (a box, a shape) or the spec's window. */
	window: [number, number];
	/** "A minor pentatonic · box 1". */
	title: string;
};

// ---- helpers --------------------------------------------------------------------------------------

/** Formula tokens of a scale or chord, with semitones. */
function formula(tokens: readonly string[]) {
	return tokens.map((t) => ({ token: t, semis: mod12(parseToken(t).semis) }));
}

/** One-finger-per-fret from `base`: fret base -> 1 … base+3 -> 4 (open strings: none). */
const fingerFrom = (fret: number, base: number): Finger | undefined =>
	fret === 0 ? undefined : (Math.min(4, Math.max(1, fret - base + 1)) as Finger);

function dotFor(string: number, fret: number, root: string | undefined, token?: string): Dot {
	const midi = midiAt(string, fret);
	return {
		string,
		fret,
		midi,
		name: root && token ? spell(root, token) : pcName(midi),
		...(token && { token }),
		root: token === '1'
	};
}

function inWindow(d: Dot, spec: FretboardSpec) {
	const [lo, hi] = spec.frets ?? [0, spec.mode === 'scale' && spec.box ? BOX_MAX_FRET : FRETS];
	return d.fret >= lo && d.fret <= hi && (!spec.strings || spec.strings.includes(d.string));
}

/** Every position of the given tones on the neck (all strings, frets 0..FRETS). */
function tonesOnNeck(root: string, tones: { token: string; semis: number }[]): Dot[] {
	const rootPc = pcOf(root);
	const byPc = new Map(tones.map((t) => [mod12(rootPc + t.semis), t.token]));
	const dots: Dot[] = [];
	for (const s of STRINGS)
		for (let f = 0; f <= FRETS; f++) {
			const token = byPc.get(mod12(midiAt(s, f)));
			if (token) dots.push(dotFor(s, f, root, token));
		}
	return dots;
}

/** Fingers for dots that fit one hand position (span ≤ 4 frets), else none. */
function handFingers(dots: Dot[]): Dot[] {
	const fretted = dots.filter((d) => d.fret > 0).map((d) => d.fret);
	if (!fretted.length) return dots;
	const base = Math.min(...fretted);
	if (Math.max(...fretted) - base > 3) return dots;
	return dots.map((d) => ({ ...d, finger: fingerFrom(d.fret, base) }));
}

// ---- boxes and positions ----------------------------------------------------------------------

/** How many boxes / positions a scale has (one per note of its base shape). */
export function boxCount(id: ScaleId): number {
	return id === 'blues' ? 5 : SCALES[id].tokens.length;
}

/**
 * A scale box: the scale run up from degree `box` on string 6, two notes per string for
 * pentatonics (boxes 1–5), three for seven-note scales (positions 1–7). Box 1 starts on the root;
 * each next box starts on the next scale note, so the boxes climb the neck (wrapping below
 * box 1 when they would pass fret 15). The blues scale is the minor-pentatonic box plus the b5
 * wherever it falls inside the box.
 */
export function boxDots(root: string, id: ScaleId, box: number): Dot[] {
	const baseId: ScaleId = id === 'blues' ? 'minor-pentatonic' : id;
	const tones = formula(SCALES[baseId].tokens);
	const perString = tones.length <= 5 ? 2 : 3;
	const rootPc = pcOf(root);
	const d = (box - 1) % tones.length;
	const first = fretOf(rootPc, 6);
	let f0 = first + mod12(tones[d].semis - tones[0].semis);
	const build = (start: number): Dot[] => {
		// The scale's notes from (string 6, start) upwards, in pitch order.
		const startMidi = OPEN_MIDI[6] + start;
		const seq: { midi: number; token: string }[] = [];
		for (let m = startMidi; seq.length < perString * 6; m++) {
			const t = tones.find((x) => mod12(rootPc + x.semis) === mod12(m));
			if (t) seq.push({ midi: m, token: t.token });
		}
		return seq.map((n, i) => {
			const string = 6 - Math.floor(i / perString);
			return dotFor(string, n.midi - OPEN_MIDI[string], root, n.token);
		});
	};
	let dots = build(f0);
	// Past fret 15: an octave lower when that fits (f0 >= 12); a position starting at fret 10 or
	// 11 has no lower octave and keeps its top notes up to BOX_MAX_FRET.
	if (Math.max(...dots.map((x) => x.fret)) > FRETS && f0 >= 12) {
		const lower = build(f0 - 12);
		if (Math.min(...lower.map((x) => x.fret)) >= 0) dots = lower;
	}
	if (Math.min(...dots.map((x) => x.fret)) < 0) dots = build((f0 += 12));
	dots = boxFingers(dots, perString);
	if (id === 'blues') {
		const lo = Math.min(...dots.map((x) => x.fret));
		const hi = Math.max(...dots.map((x) => x.fret));
		const b5 = mod12(rootPc + 6);
		for (const s of STRINGS)
			for (let f = lo; f <= hi; f++)
				if (mod12(midiAt(s, f)) === b5)
					dots.push({ ...dotFor(s, f, root, 'b5'), extra: true, finger: fingerFrom(f, lo) });
	}
	return sortDots(dots);
}

/** Pentatonic boxes: one finger per fret from the box's lowest fret; 3nps: per-string stretch. */
function boxFingers(dots: Dot[], perString: number): Dot[] {
	const lo = Math.min(...dots.map((d) => d.fret).filter((f) => f > 0));
	if (perString === 2) return dots.map((d) => ({ ...d, finger: fingerFrom(d.fret, lo) }));
	return dots.map((d) => {
		const row = dots.filter((x) => x.string === d.string).map((x) => x.fret);
		const [a, , c] = [...row].sort((x, y) => x - y);
		if (d.fret === 0) return d;
		if (c - a <= 3) return { ...d, finger: fingerFrom(d.fret, Math.max(1, a)) };
		// A stretch (e.g. frets 3 5 7): first finger 1, last finger 4, the middle 2 (or 3 when
		// it sits a fret below the top).
		const finger: Finger = d.fret === a ? 1 : d.fret === c ? 4 : c - d.fret === 1 ? 3 : 2;
		return { ...d, finger };
	});
}

const sortDots = (dots: Dot[]) => dots.sort((a, b) => a.midi - b.midi || b.string - a.string);

// ---- CAGED ------------------------------------------------------------------------------------

type ShapeTemplate = {
	/** Frets from the shape's base, string 6 first (null: not played). */
	frets: (number | null)[];
	/** The string carrying the root the shape is named by, and its fret in the template. */
	rootString: number;
	rootFret: number;
	/** Fingers when moved up the neck (index finger as the nut) and in open position. */
	moved: (Finger | null)[];
	open: (Finger | null)[];
};

const CAGED: Record<CagedShape, ShapeTemplate> = {
	C: {
		frets: [null, 3, 2, 0, 1, 0],
		rootString: 5,
		rootFret: 3,
		moved: [null, 4, 3, 1, 2, 1],
		open: [null, 3, 2, null, 1, null]
	},
	A: {
		frets: [null, 0, 2, 2, 2, 0],
		rootString: 5,
		rootFret: 0,
		moved: [null, 1, 2, 3, 4, 1],
		open: [null, null, 1, 2, 3, null]
	},
	G: {
		frets: [3, 2, 0, 0, 0, 3],
		rootString: 6,
		rootFret: 3,
		moved: [3, 2, 1, 1, 1, 4],
		open: [2, 1, null, null, null, 3]
	},
	E: {
		frets: [0, 2, 2, 1, 0, 0],
		rootString: 6,
		rootFret: 0,
		moved: [1, 3, 4, 2, 1, 1],
		open: [null, 2, 3, 1, null, null]
	},
	D: {
		frets: [null, null, 0, 2, 3, 2],
		rootString: 4,
		rootFret: 0,
		moved: [null, null, 1, 2, 4, 3],
		open: [null, null, null, 1, 3, 2]
	}
};

/** Where a CAGED shape of this root sits: the fret its "nut" (index finger) is at, 0..11. */
export function cagedBase(root: string, shape: CagedShape): number {
	const t = CAGED[shape];
	return mod12(fretOf(pcOf(root), t.rootString) - t.rootFret);
}

/** The five shapes of a root in neck order (lowest base fret first), e.g. C: C A G E D. */
export function cagedOrder(root: string): { shape: CagedShape; base: number }[] {
	return CAGED_SHAPES.map((shape) => ({ shape, base: cagedBase(root, shape) })).sort(
		(a, b) => a.base - b.base
	);
}

/** One CAGED shape of a major chord as dots (chord tones R 3 5, fingered). */
export function cagedDots(root: string, shape: CagedShape): Dot[] {
	const t = CAGED[shape];
	const base = cagedBase(root, shape);
	const tones = formula(CHORD_TYPES.major.tokens);
	const rootPc = pcOf(root);
	const dots: Dot[] = [];
	t.frets.forEach((rel, i) => {
		if (rel === null) return;
		const string = 6 - i;
		const fret = base + rel;
		const token = tones.find((x) => mod12(rootPc + x.semis) === mod12(midiAt(string, fret)))!.token;
		const finger = (base === 0 ? t.open : t.moved)[i];
		dots.push({ ...dotFor(string, fret, root, token), ...(finger && { finger }) });
	});
	return sortDots(dots);
}

// ---- triads on string sets ------------------------------------------------------------------------

/** Strings of a set: "1-3" -> [3, 2, 1] (low to high). */
export const setStrings = (set: string): number[] => {
	const [a, b] = set.split('-').map(Number);
	return [Math.max(a, b), Math.max(a, b) - 1, Math.min(a, b)];
};

/**
 * Close-voiced triads on three adjacent strings: root position and both inversions, every octave
 * that fits frets 0..FRETS (span ≤ 4 frets). Each shape is a region named by its bass note.
 */
export function triadShapes(
	root: string,
	type: TriadType,
	strings: number[]
): { dots: Dot[]; inversion: 0 | 1 | 2; from: number; to: number }[] {
	const tones = formula(CHORD_TYPES[type].tokens);
	const rootPc = pcOf(root);
	const [low, mid, high] = [...strings].sort((a, b) => b - a);
	const out: { dots: Dot[]; inversion: 0 | 1 | 2; from: number; to: number }[] = [];
	for (const inv of [0, 1, 2] as const) {
		const order = [tones[inv], tones[(inv + 1) % 3], tones[(inv + 2) % 3]];
		for (let f = 0; f <= FRETS; f++) {
			if (mod12(midiAt(low, f)) !== mod12(rootPc + order[0].semis)) continue;
			// Each next string: the next chord tone above the previous note (close voicing).
			const notes = [{ string: low, midi: midiAt(low, f), token: order[0].token }];
			for (const [k, s] of [mid, high].entries()) {
				const prev = notes[notes.length - 1].midi;
				let m = prev + 1;
				while (mod12(m) !== mod12(rootPc + order[k + 1].semis)) m++;
				notes.push({ string: s, midi: m, token: order[k + 1].token });
			}
			const frets = notes.map((n) => n.midi - OPEN_MIDI[n.string]);
			if (frets.some((x) => x < 0 || x > FRETS)) continue;
			const fretted = frets.filter((x) => x > 0);
			const lo = Math.min(...frets);
			const hi = Math.max(...frets);
			if (hi - lo > 4) continue;
			const base = fretted.length ? Math.min(...fretted) : 1;
			const dots = distinctFingers(
				notes.map((n, i) => ({
					...dotFor(n.string, frets[i], root, n.token),
					finger: fingerFrom(frets[i], base)
				}))
			);
			out.push({ dots, inversion: inv, from: lo, to: hi });
		}
	}
	return out.sort((a, b) => a.from - b.from || a.inversion - b.inversion);
}

/**
 * Two notes on one fret take two fingers: the higher string gets the next finger up. When that
 * runs past the pinky (two notes on the top fret, e.g. sus4 frets 5 8 8), the notes on the top
 * fret take the fingers just below 4 instead, the lower string the lower finger.
 */
export function distinctFingers(dots: Dot[]): Dot[] {
	const used = new Set<number>();
	let out = [...dots]
		.sort((a, b) => a.fret - b.fret || b.string - a.string)
		.map((d) => {
			if (!d.finger) return d;
			let f = d.finger;
			while (used.has(f) && f < 4) f++;
			used.add(f);
			return { ...d, finger: f as Finger };
		});
	const fingers = out.filter((d) => d.finger).map((d) => d.finger);
	if (new Set(fingers).size !== fingers.length) {
		const top = Math.max(...out.filter((d) => d.finger).map((d) => d.fret));
		const group = out.filter((d) => d.finger && d.fret === top).sort((a, b) => b.string - a.string);
		const at = new Map(group.map((d, i) => [d, (4 - (group.length - 1 - i)) as Finger]));
		out = out.map((d) => (at.has(d) ? { ...d, finger: at.get(d) } : d));
	}
	return out.sort((a, b) => a.midi - b.midi);
}

export const INVERSION_LABEL = ['Root', '1st inv', '2nd inv'] as const;

// ---- overlays ---------------------------------------------------------------------------------

const spanOf = (dots: Dot[], min = 3): [number, number] => {
	if (!dots.length) return [0, 12];
	const lo = Math.min(...dots.map((d) => d.fret));
	let hi = Math.max(...dots.map((d) => d.fret));
	if (hi - lo < min) hi = Math.min(FRETS, lo + min);
	return [lo, hi];
};

/** A fret of context either side of a shape (never past the nut or fret 15, unless the shape is). */
const padded = ([lo, hi]: [number, number]): [number, number] => [
	lo === 0 ? 0 : lo - 1,
	Math.min(Math.max(FRETS, hi), hi + 1)
];

/** The church modes in scale order (the `modes="all"` chips). */
export const MODE_IDS = [
	'ionian',
	'dorian',
	'phrygian',
	'lydian',
	'mixolydian',
	'aeolian',
	'locrian'
] as const satisfies readonly ScaleId[];
export type ModeId = (typeof MODE_IDS)[number];
export const isModeId = (v: string): v is ModeId => (MODE_IDS as readonly string[]).includes(v);

/** Each mode's colour note: the degree that sets it apart from major or natural minor. */
export const MODE_COLOR: Record<ModeId, string[]> = {
	ionian: [],
	dorian: ['6'],
	phrygian: ['b2'],
	lydian: ['#4'],
	mixolydian: ['b7'],
	aeolian: ['b6'],
	locrian: ['b5']
};

/** The tokens a spec emphasises: its `highlight=`, else a mode's colour note (modes="all"). */
export function accentTokens(spec: FretboardSpec): string[] {
	if (spec.highlight?.length) return spec.highlight;
	if (spec.modes && spec.scale && isModeId(spec.scale)) return MODE_COLOR[spec.scale];
	return [];
}

/** Same interval (by semitones): "#4" matches "b5" too when a formula spells it that way. */
const sameDegree = (a: string, b: string) =>
	a === b ||
	(isToken(a) && isToken(b) && mod12(parseToken(a).semis) === mod12(parseToken(b).semis));

export const MODE_TITLE: Record<FretboardMode, string> = {
	scale: 'Scale',
	chord: 'Arpeggio',
	caged: 'CAGED',
	triads: 'Triads',
	note: 'One note',
	notes: 'Notes'
};

/** The dots, bands and suggested window of a spec. */
export function overlay(spec: FretboardSpec): Overlay {
	const root = spec.root ?? 'C';
	let dots: Dot[] = [];
	let regions: Region[] = [];
	let title = '';
	let fitted = false;
	switch (spec.mode) {
		case 'scale': {
			const id = spec.scale ?? 'major';
			title = `${root} ${SCALES[id].name.toLowerCase()}`;
			if (spec.modes && isModeId(id) && MODE_COLOR[id].length)
				title += ` · ${MODE_COLOR[id].map((t) => t.replace('b', '♭').replace('#', '♯')).join(' ')}`;
			if (spec.box) {
				dots = boxDots(root, id, spec.box);
				title += ` · ${SCALES[id].tokens.length === 7 ? 'position' : 'box'} ${spec.box}`;
				fitted = true;
			} else {
				dots = tonesOnNeck(root, formula(SCALES[id].tokens));
				if (id === 'blues') dots = dots.map((d) => (d.token === 'b5' ? { ...d, extra: true } : d));
			}
			break;
		}
		case 'chord': {
			const type = spec.chord ?? 'major';
			dots = tonesOnNeck(root, formula(CHORD_TYPES[type].tokens));
			title = `${root}${CHORD_TYPES[type].symbol} arpeggio`;
			break;
		}
		case 'caged': {
			const shapes = spec.shape && spec.shape !== 'all' ? [spec.shape] : [...CAGED_SHAPES];
			const seen = new Set<string>();
			for (const shape of shapes) {
				const sd = cagedDots(root, shape);
				const frets = sd.map((d) => d.fret);
				regions.push({ from: Math.min(...frets), to: Math.max(...frets), label: shape });
				for (const d of sd) {
					const key = `${d.string}:${d.fret}`;
					if (!seen.has(key)) dots.push(shapes.length > 1 ? { ...d, finger: undefined } : d);
					seen.add(key);
				}
			}
			title = `${root} major · ${shapes.length > 1 ? 'CAGED' : `${shapes[0]} shape`}`;
			fitted = shapes.length === 1;
			if (shapes.length === 1) regions = [];
			break;
		}
		case 'triads': {
			const type = (spec.chord ?? 'major') as TriadType;
			const strings = spec.strings ?? [3, 2, 1];
			const shapes = triadShapes(root, type, strings).filter(
				(s) => !spec.frets || (s.from >= spec.frets[0] && s.to <= spec.frets[1])
			);
			dots = shapes.flatMap((s) => s.dots);
			regions = shapes.map((s) => ({
				from: s.from,
				to: s.to,
				label: INVERSION_LABEL[s.inversion]
			}));
			title = `${root}${CHORD_TYPES[type].symbol || ''} triads · strings ${Math.min(...strings)}–${Math.max(...strings)}`;
			// The string filter selects the set; the dots already respect it.
			dots = withAccents(dots, spec);
			return { dots, regions, window: spec.frets ?? padded(spanOf(dots)), title };
		}
		case 'note': {
			const note = spec.note ?? 'C';
			const pc = pcOf(note);
			for (const s of STRINGS)
				for (let f = 0; f <= FRETS; f++)
					if (mod12(midiAt(s, f)) === pc)
						dots.push({ string: s, fret: f, midi: midiAt(s, f), name: note, root: true });
			title = `Every ${note}`;
			break;
		}
		case 'notes': {
			const naturals = spec.notes !== 'all';
			for (const s of STRINGS)
				for (let f = 0; f <= FRETS; f++) {
					const name = pcName(midiAt(s, f));
					if (naturals && name.length > 1) continue;
					dots.push({ string: s, fret: f, midi: midiAt(s, f), name, root: false });
				}
			title = naturals ? 'Natural notes' : 'All notes';
			break;
		}
	}
	dots = sortDots(dots.filter((d) => inWindow(d, spec)));
	if (!fitted && spec.frets) dots = handFingersIfFit(dots, spec.frets);
	dots = withAccents(dots, spec);
	const window: [number, number] = spec.frets ?? (fitted ? padded(spanOf(dots)) : [0, 12]);
	return { dots, regions, window, title };
}

function withAccents(dots: Dot[], spec: FretboardSpec): Dot[] {
	const tokens = accentTokens(spec);
	if (!tokens.length) return dots;
	return dots.map((d) =>
		d.token && tokens.some((t) => sameDegree(t, d.token!)) ? { ...d, accent: true } : d
	);
}

/** A small window (one hand position) gets fingers; a wide one does not. */
const handFingersIfFit = (dots: Dot[], [lo, hi]: [number, number]) =>
	hi - Math.max(1, lo) <= 3 ? handFingers(dots) : dots;

/** What a dot shows. */
export function dotLabel(d: Dot, mode: LabelMode): string {
	if (mode === 'none') return '';
	if (mode === 'fingers') return d.finger ? String(d.finger) : d.fret === 0 ? '0' : '';
	if (mode === 'intervals' && d.token)
		return d.token === '1' ? 'R' : d.token.replace(/b/g, '♭').replace(/#/g, '♯');
	return d.name.replace(/#/g, '♯').replace(/(?<=^[A-G])b/g, '♭');
}

// ---- parsing (directive attributes and the explorer's URL) ------------------------------------------

/** Every attribute ::fretboard takes (and the explorer's query keys). */
export const FRETBOARD_ATTRS = [
	'scale',
	'chord',
	'caged',
	'triads',
	'note',
	'notes',
	'root',
	'box',
	'strings',
	'frets',
	'labels',
	'highlight',
	'modes'
] as const;

/** "6" | "6,5" | "1-3" | "all" -> string numbers (high to low order kept), or null. */
export function parseStrings(v: string): number[] | null {
	if (v === 'all') return [1, 2, 3, 4, 5, 6];
	const range = /^([1-6])-([1-6])$/.exec(v);
	if (range) {
		const [a, b] = [Number(range[1]), Number(range[2])].sort();
		return Array.from({ length: b - a + 1 }, (_, i) => a + i);
	}
	if (!/^[1-6](,[1-6])*$/.test(v)) return null;
	const list = [...new Set(v.split(',').map(Number))];
	return list.sort((a, b) => a - b);
}

export function parseFrets(v: string): [number, number] | null {
	const m = /^(\d{1,2})-(\d{1,2})$/.exec(v);
	if (!m) return null;
	const lo = Number(m[1]);
	const hi = Number(m[2]);
	return lo <= hi && hi <= FRETS ? [lo, hi] : null;
}

/**
 * A spec from attributes (`::fretboard{scale="minor-pentatonic" root="A" box="1"}` or the
 * explorer's query): problems are pushed; null when nothing usable remains.
 */
export function parseFretboard(
	attrs: Record<string, string>,
	problems: string[]
): FretboardSpec | null {
	const before = problems.length;
	for (const k of Object.keys(attrs))
		if (!(FRETBOARD_ATTRS as readonly string[]).includes(k))
			problems.push(`::fretboard has no attribute "${k}"`);
	// modes="all" is a scale view (scale= may pick the mode shown first).
	const modes = (['scale', 'chord', 'caged', 'triads', 'note', 'notes', 'modes'] as const).filter(
		(m) => m in attrs && !(m === 'scale' && 'modes' in attrs)
	);
	if (modes.length !== 1) {
		problems.push(
			`::fretboard needs exactly one of scale=, chord=, caged=, triads=, note=, notes=, modes=${modes.length ? ` (got ${modes.join(', ')})` : ''}`
		);
		return null;
	}
	const isModes = modes[0] === 'modes';
	const mode: FretboardMode = isModes ? 'scale' : (modes[0] as FretboardMode);
	const spec: FretboardSpec = {
		mode,
		labels: mode === 'note' || mode === 'notes' ? 'notes' : 'intervals'
	};
	const needsRoot = mode === 'scale' || mode === 'chord' || mode === 'caged' || mode === 'triads';
	if (needsRoot) {
		if (!attrs.root) problems.push(`::fretboard ${mode}= needs root=`);
		else if (!isNoteName(attrs.root))
			problems.push(`root "${attrs.root}" is not a note name (C, F#, Bb…)`);
		else spec.root = attrs.root;
	} else if (attrs.root !== undefined) problems.push(`::fretboard ${mode}= takes no root=`);

	const v = attrs[mode];
	if (isModes) {
		if (attrs.modes !== 'all') problems.push(`modes must be "all" (got "${attrs.modes}")`);
		else spec.modes = 'all';
		if (v !== undefined && !isModeId(v))
			problems.push(
				`with modes="all", scale= picks the first mode: ${MODE_IDS.join(', ')} (got "${v}")`
			);
		else spec.scale = (v as ModeId | undefined) ?? 'ionian';
		if (attrs.box !== undefined) problems.push('modes="all" takes no box=');
	} else if (mode === 'scale') {
		if (!isScale(v)) problems.push(`unknown scale "${v}" (use ${Object.keys(SCALES).join(', ')})`);
		else spec.scale = v;
	} else if (mode === 'chord') {
		if (!isChordType(v))
			problems.push(`unknown chord type "${v}" (use ${Object.keys(CHORD_TYPES).join(', ')})`);
		else spec.chord = v;
	} else if (mode === 'caged') {
		if (v !== 'all' && !(CAGED_SHAPES as readonly string[]).includes(v))
			problems.push(`caged must be C, A, G, E, D or all (got "${v}")`);
		else spec.shape = v as CagedShape | 'all';
	} else if (mode === 'triads') {
		if (!(TRIAD_TYPES as readonly string[]).includes(v))
			problems.push(`triads must be one of ${TRIAD_TYPES.join(', ')} (got "${v}")`);
		else spec.chord = v as TriadType;
	} else if (mode === 'note') {
		if (!isNoteName(v)) problems.push(`note "${v}" is not a note name`);
		else spec.note = v;
	} else if (mode === 'notes') {
		if (v !== 'naturals' && v !== 'all') problems.push(`notes must be "naturals" or "all"`);
		else spec.notes = v;
	}

	if (attrs.box !== undefined) {
		const n = Number(attrs.box);
		const max = spec.scale ? boxCount(spec.scale) : 0;
		if (mode !== 'scale') problems.push('box= goes with scale=');
		else if (!/^\d$/.test(attrs.box) || n < 1 || n > max)
			problems.push(`box must be 1-${max} for ${spec.scale ?? 'this scale'}`);
		else spec.box = n;
	}
	if (attrs.strings !== undefined) {
		const s = parseStrings(attrs.strings);
		if (!s)
			problems.push(`strings must be like "6", "6,5", "1-3" or "all" (got "${attrs.strings}")`);
		else if (mode === 'triads' && !(s.length === 3 && s[2] - s[0] === 2))
			problems.push('triads take three adjacent strings: strings="1-3", "2-4", "3-5" or "4-6"');
		else spec.strings = s;
	}
	if (attrs.frets !== undefined) {
		const f = parseFrets(attrs.frets);
		if (!f) problems.push(`frets must be "lo-hi" within 0-${FRETS} (got "${attrs.frets}")`);
		else spec.frets = f;
	}
	if (attrs.highlight !== undefined) {
		const tokens = attrs.highlight.split(',').map((t) => t.trim());
		const formula = highlightFormula(spec);
		if (!formula)
			problems.push(
				`highlight= needs intervals: use it with scale=, chord=, caged=, triads= or modes=`
			);
		else if (!tokens.length || tokens.some((t) => !isToken(t)))
			problems.push(`highlight must be interval degrees like "#4,b2" (got "${attrs.highlight}")`);
		else {
			const missing = tokens.filter((t) => !formula.some((f) => sameDegree(t, f)));
			if (missing.length)
				problems.push(
					`highlight ${missing.join(', ')} is not in this ${isModes ? 'set of modes' : mode}`
				);
			else spec.highlight = tokens;
		}
	}
	if (attrs.labels !== undefined) {
		if (!(LABEL_MODES as string[]).includes(attrs.labels))
			problems.push(`labels must be ${LABEL_MODES.join(', ')} (got "${attrs.labels}")`);
		else spec.labels = attrs.labels as LabelMode;
	}
	if (problems.length > before) return null;
	if (overlay(spec).dots.length === 0) {
		problems.push('::fretboard shows no notes with these strings/frets');
		return null;
	}
	return spec;
}

/** The degrees a spec can emphasise (all modes' degrees for modes="all"), null without intervals. */
function highlightFormula(spec: FretboardSpec): string[] | null {
	if (spec.modes) return MODE_IDS.flatMap((m) => [...SCALES[m].tokens]);
	if (spec.mode === 'scale' && spec.scale) return [...SCALES[spec.scale].tokens];
	if ((spec.mode === 'chord' || spec.mode === 'triads') && spec.chord)
		return [...CHORD_TYPES[spec.chord].tokens];
	if (spec.mode === 'caged') return [...CHORD_TYPES.major.tokens];
	return null;
}

/** The spec as attributes / query params (the inverse of parseFretboard). */
export function fretboardParams(spec: FretboardSpec): Record<string, string> {
	const out: Record<string, string> = {};
	const mv = {
		scale: spec.scale,
		chord: spec.chord,
		caged: spec.shape,
		triads: spec.chord,
		note: spec.note,
		notes: spec.notes
	}[spec.mode];
	out[spec.mode] = mv ?? '';
	if (spec.root) out.root = spec.root;
	if (spec.box) out.box = String(spec.box);
	if (spec.strings) out.strings = spec.strings.join(',');
	if (spec.frets) out.frets = spec.frets.join('-');
	out.labels = spec.labels;
	if (spec.highlight?.length) out.highlight = spec.highlight.join(',');
	if (spec.modes) out.modes = spec.modes;
	return out;
}

/** Natural note names (quiz prompts). */
export const NATURAL_NAMES: string[] = [...NATURALS];
