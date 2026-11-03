// Strum patterns: one slot per 8th note, "D" down, "U" up, "-" rest (a missed strum: the hand
// still moves). Pure helpers shared by the lesson compiler and the <StrumPattern> widget.
import type { TimeSignature } from '../metronome/timeline.ts';
import type { StrumSlot } from './types.ts';

/** Allowed lengths: one bar of 2/4, 3/4 or 4/4, or two bars of 3/4 or 4/4. */
export const STRUM_LENGTHS = [4, 6, 8, 12, 16] as const;
export const STRUM_BPM_MIN = 40;
export const STRUM_BPM_MAX = 200;

export function parseStrum(src: string): { slots: StrumSlot[] } | { error: string } {
	const tokens = src.trim().split(/\s+/).filter(Boolean);
	const bad = tokens.find((t) => !['D', 'U', '-'].includes(t));
	if (bad !== undefined) return { error: `strum slot "${bad}" must be D, U or -` };
	if (!(STRUM_LENGTHS as readonly number[]).includes(tokens.length))
		return {
			error: `strum pattern has ${tokens.length} slots; use ${STRUM_LENGTHS.join(', ')} (8th notes)`
		};
	if (!tokens.some((t) => t !== '-')) return { error: 'strum pattern has no strums' };
	return { slots: tokens as StrumSlot[] };
}

/** Metronome meter for a pattern: beats per bar and the time signature that plays it. */
export function strumMeter(slots: number): { beats: number; timeSignature: TimeSignature } {
	const beats = slots === 4 ? 2 : slots % 6 === 0 ? 3 : 4;
	return { beats, timeSignature: `${beats}/4` as TimeSignature };
}

/** The slot heard at a metronome click (8th-note subdivision, counted from the start). */
export function strumSlotAt(click: { bar: number; beat: number; sub: number }, slots: number) {
	const { beats } = strumMeter(slots);
	return ((click.bar * beats + click.beat) * 2 + click.sub) % slots;
}

/** Count syllable under a slot: "1 & 2 & ...". */
export const strumCount = (slot: number, slots: number) =>
	slot % 2 ? '&' : String(((slot / 2) % strumMeter(slots).beats) + 1);
