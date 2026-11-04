// What the ear trainer asks: the kinds of exercise and their items, in teaching order (the adaptive
// trainer unlocks a set's items in this order). Shared by the tool, the ::ear lesson widget, the
// mastery checks and the API.
import { CHORD_TYPES, INTERVALS, numeralLabel } from '../theory/scales.ts';

export const EAR_KINDS = ['intervals', 'chords', 'progressions', 'playback'] as const;
export type EarKind = (typeof EAR_KINDS)[number];
export const isEarKind = (k: string): k is EarKind => (EAR_KINDS as readonly string[]).includes(k);

export type EarItem = { id: string; label: string; hint: string };

const intervalHint: Record<string, string> = {
	m2: 'half step',
	M2: 'whole step',
	m3: 'minor 3rd',
	M3: 'major 3rd',
	P4: '4th',
	TT: 'tritone',
	P5: '5th',
	m6: 'minor 6th',
	M6: 'major 6th',
	m7: 'minor 7th',
	M7: 'major 7th',
	P8: 'octave'
};
/** Easiest to tell apart first. */
const INTERVAL_ORDER = ['P8', 'P5', 'P4', 'M3', 'm3', 'M2', 'm2', 'M6', 'm6', 'm7', 'M7', 'TT'];
const CHORD_ORDER = ['major', 'minor', '7', 'maj7', 'm7', 'sus4', 'sus2', 'dim'] as const;
const CHORD_LABEL: Record<string, string> = {
	major: 'Major',
	minor: 'Minor',
	'7': '7',
	maj7: 'maj7',
	m7: 'm7',
	sus4: 'sus4',
	sus2: 'sus2',
	dim: 'dim'
};
const CHORD_HINT: Record<string, string> = {
	major: 'bright',
	minor: 'sad',
	'7': 'bluesy, wants to move',
	maj7: 'dreamy',
	m7: 'soft, jazzy',
	sus4: 'unresolved',
	sus2: 'open',
	dim: 'tense'
};
const PROGRESSION_ORDER = ['I', 'V', 'IV', 'vi', 'ii', 'iii'];
const PROGRESSION_HINT: Record<string, string> = {
	I: 'home',
	V: 'pulls home',
	IV: 'lifts',
	vi: 'minor, sad',
	ii: 'minor, before V',
	iii: 'minor, rare'
};

export const EAR_ITEMS: Record<EarKind, EarItem[]> = {
	intervals: INTERVAL_ORDER.map((id) => ({
		id,
		label: id === 'TT' ? 'Tritone' : id,
		hint: intervalHint[id]
	})),
	chords: CHORD_ORDER.map((id) => ({ id, label: CHORD_LABEL[id], hint: CHORD_HINT[id] })),
	progressions: PROGRESSION_ORDER.map((id) => ({
		id,
		label: numeralLabel(id),
		hint: PROGRESSION_HINT[id]
	})),
	playback: ['E', 'F', 'G', 'A', 'B', 'C', 'D'].map((id) => ({ id, label: id, hint: 'note' }))
};

export const EAR_TITLE: Record<EarKind, string> = {
	intervals: 'Intervals',
	chords: 'Chord quality',
	progressions: 'Progressions',
	playback: 'Play it back'
};

/** The default set of each kind (the whole kind, but progressions start on I IV V vi). */
export const DEFAULT_SET: Record<EarKind, string[]> = {
	intervals: INTERVAL_ORDER,
	chords: [...CHORD_ORDER],
	progressions: ['I', 'V', 'IV', 'vi'],
	playback: EAR_ITEMS.playback.map((i) => i.id)
};

export const isEarItem = (kind: EarKind, id: string) => EAR_ITEMS[kind].some((i) => i.id === id);
export const itemLabel = (kind: EarKind, id: string) =>
	EAR_ITEMS[kind].find((i) => i.id === id)?.label ?? id;

/** A set in teaching order (duplicates and unknown ids dropped). */
export const orderSet = (kind: EarKind, ids: readonly string[]) =>
	EAR_ITEMS[kind].map((i) => i.id).filter((id) => ids.includes(id));

/** "P4,P5,P8" -> the set in teaching order; problems for unknown ids or too few items. */
export function parseEarSet(kind: EarKind, csv: string, problems: string[]): string[] {
	const ids = csv
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	for (const id of ids)
		if (!isEarItem(kind, id))
			problems.push(
				`unknown ${kind} item "${id}" (use ${EAR_ITEMS[kind].map((i) => i.id).join(', ')})`
			);
	const set = orderSet(kind, ids);
	if (kind !== 'playback' && set.length < 2) problems.push(`an ${kind} set needs at least 2 items`);
	return set;
}

export const EAR_DIRS = ['asc', 'desc', 'harm', 'mixed'] as const;
export type EarDir = (typeof EAR_DIRS)[number];
export const DIR_LABEL: Record<EarDir, string> = {
	asc: 'Up',
	desc: 'Down',
	harm: 'Together',
	mixed: 'Mixed'
};

/** Keys the progression drill plays in ("random" picks one per question). */
export const PROGRESSION_KEYS = ['C', 'G', 'D', 'A', 'E', 'F'] as const;

// Chord types the ear items name, checked against the theory formulas at import time.
for (const id of CHORD_ORDER)
	if (!(id in CHORD_TYPES)) throw new Error(`ear chord ${id} has no formula`);
for (const id of INTERVAL_ORDER)
	if (!INTERVALS.some((i) => i.id === id)) throw new Error(`ear interval ${id} is unknown`);
