// Strum patterns: one slot per 8th note (the default) or per 16th note, "D" down, "U" up, "-" rest
// (a missed strum: the hand still moves). Pure helpers shared by the lesson compiler and the
// <StrumPattern> / <StrumRow> widgets. Two ways to write a pattern:
//   "D - D U - U D U"       one slot per token: 8th notes (16ths with the ::strum sub=16 attribute)
//   "D-DU -UDU D-DU -UDU"   one token per beat: 2 characters = 8ths, 4 characters = 16ths
import type { TimeSignature } from '../metronome/timeline.ts';
import type { StrumSlot } from './types.ts';

/** Slot value: 8th or 16th notes. */
export type StrumSub = 8 | 16;
/**
 * Compound meter: 6/8 counts six 8th notes "1 2 3 4 5 6", two big beats on 1 and 4 (simple
 * meters leave it out: a 6-slot pattern is a bar of 3/4, "1 & 2 & 3 &").
 */
export type StrumTs = '6/8';
export type Strum = { slots: StrumSlot[]; sub: StrumSub; ts?: StrumTs };
export const isStrumTs = (v: string): v is StrumTs => v === '6/8';
/** 6/8: the slots on a big beat (1 and 4). */
export const compoundBeat = (slot: number) => slot % 3 === 0;

/** Allowed lengths in 8ths: one bar of 2/4, 3/4 or 4/4, or two bars of 3/4 or 4/4. */
export const STRUM_LENGTHS = [4, 6, 8, 12, 16] as const;
/** Allowed lengths in 16ths: the same bars, twice the slots. */
export const STRUM_LENGTHS_16 = STRUM_LENGTHS.map((n) => n * 2);
export const STRUM_BPM_MIN = 40;
export const STRUM_BPM_MAX = 200;

/** Slots per beat: 2 (8ths) or 4 (16ths). */
export const perBeat = (sub: StrumSub): 2 | 4 => (sub === 16 ? 4 : 2);

const SLOT_RE = /^[DU-]+$/;

/**
 * Parses a pattern. `sub` (the ::strum attribute) makes single-slot tokens 16ths; beat-grouped
 * tokens ("D-DU") carry their own value.
 */
export function parseStrum(src: string, sub?: StrumSub, ts?: StrumTs): Strum | { error: string } {
	const tokens = src.trim().split(/\s+/).filter(Boolean);
	const bad = tokens.find((t) => !SLOT_RE.test(t));
	if (bad !== undefined) return { error: `strum slot "${bad}" must be D, U or -` };
	const width = tokens[0]?.length ?? 1;
	if (tokens.some((t) => t.length !== width))
		return {
			error:
				'strum pattern mixes slots and beat groups: write one slot per token ("D - D U") or one beat per token ("D-DU -UDU")'
		};
	if (width !== 1 && width !== 2 && width !== 4)
		return {
			error: `strum beat "${tokens[0]}" has ${width} slots; a beat is 2 (8ths) or 4 (16ths)`
		};
	const grouped: StrumSub | undefined = width === 2 ? 8 : width === 4 ? 16 : undefined;
	if (grouped && sub && grouped !== sub)
		return { error: `strum beats of ${width} slots are ${grouped}ths, but sub=${sub}` };
	const value = grouped ?? sub ?? 8;
	const slots = tokens.join('').split('') as StrumSlot[];
	if (ts === '6/8') {
		if (value !== 8) return { error: 'a 6/8 strum is written in 8th notes (one slot per token)' };
		if (slots.length !== 6 && slots.length !== 12)
			return {
				error: `a 6/8 strum pattern has 6 slots (one bar) or 12 (two); got ${slots.length}`
			};
		if (!slots.some((t) => t !== '-')) return { error: 'strum pattern has no strums' };
		return { slots, sub: 8, ts };
	}
	const lengths: readonly number[] = value === 16 ? STRUM_LENGTHS_16 : STRUM_LENGTHS;
	if (!lengths.includes(slots.length))
		return {
			error: `strum pattern has ${slots.length} slots; use ${lengths.join(', ')} (${value}th notes: one or two bars of 2/4, 3/4 or 4/4)`
		};
	if (!slots.some((t) => t !== '-')) return { error: 'strum pattern has no strums' };
	return { slots, sub: value };
}

/** The pattern written back as one beat per token ("D-DU -UDU"), the 16th-note form. */
export const formatStrum = ({ slots, sub }: Strum) =>
	sub === 8
		? slots.join(' ')
		: Array.from({ length: slots.length / perBeat(sub) }, (_, b) =>
				slots.slice(b * perBeat(sub), (b + 1) * perBeat(sub)).join('')
			).join(' ');

/** Slots per metronome click: 2 or 4 in simple meters, 1 in 6/8 (the click counts 8ths). */
export const slotsPerClick = (sub: StrumSub, ts?: StrumTs) => (ts === '6/8' ? 1 : perBeat(sub));

/** Metronome meter for a pattern: beats per bar and the time signature that plays it. */
export function strumMeter(
	slots: number,
	sub: StrumSub = 8,
	ts?: StrumTs
): { beats: number; timeSignature: TimeSignature } {
	if (ts === '6/8') return { beats: 6, timeSignature: '6/8' };
	const total = slots / perBeat(sub);
	const beats = total === 2 ? 2 : total % 3 === 0 ? 3 : 4;
	return { beats, timeSignature: `${beats}/4` as TimeSignature };
}

/**
 * Why a pattern does not fit the meter `num`/`den` (it must be one bar of it or two); null when
 * it fits.
 */
export function strumMeterProblem({ slots, sub }: Strum, num: number, den = 4): string | null {
	const perBar = (num * sub) / den;
	if (!Number.isInteger(perBar) || perBar < 1)
		return `a ${sub}th-note strum row cannot follow ${num}/${den}`;
	if (slots.length === perBar || slots.length === perBar * 2) return null;
	return `strum pattern has ${slots.length} ${sub}th-note slots; ${num}/${den} needs ${perBar} (one bar) or ${perBar * 2} (two bars)`;
}

/** The slot heard at a metronome click (the metronome subdivides each beat into slots). */
export function strumSlotAt(
	click: { bar: number; beat: number; sub: number },
	slots: number,
	sub: StrumSub = 8,
	ts?: StrumTs
) {
	const { beats } = strumMeter(slots, sub, ts);
	return ((click.bar * beats + click.beat) * slotsPerClick(sub, ts) + click.sub) % slots;
}

/**
 * The slot under the playhead of a tab in `beats`/`den` (\ts (6 8): 6 and 8): `bar` (0-based) and
 * how far into it (0..1); -1 when stopped.
 */
export function strumSlotInBar(
	strum: { length: number; sub?: StrumSub },
	beats: number,
	bar: number,
	frac: number,
	den = 4
): number {
	const n = strum.length;
	if (!n || bar < 0) return -1;
	const perBar = Math.max(1, Math.round((beats * (strum.sub ?? 8)) / den));
	const bars = Math.max(1, Math.round(n / perBar));
	return ((bar % bars) * perBar + Math.min(perBar - 1, Math.floor(frac * perBar))) % n;
}

const SIXTEENTH_COUNTS = ['', 'e', '&', 'a'];

/** The time signature a score writes (`\ts (6 8)`, `\ts 3 4`), 4/4 when it writes none. */
export function scoreMeter(tex: string): { num: number; den: number; ts?: StrumTs } {
	const m = /\\ts\s*\(?\s*(\d+)\s+(\d+)/.exec(tex);
	const num = Number(m?.[1] ?? 4);
	const den = Number(m?.[2] ?? 4);
	return { num, den, ...(num === 6 && den === 8 && { ts: '6/8' as const }) };
}

/**
 * Count syllable under a slot: "1 & 2 & …" (8ths), "1 e & a 2 e & a …" (16ths), or
 * "1 2 3 4 5 6" in 6/8.
 */
export function strumCount(slot: number, slots: number, sub: StrumSub = 8, ts?: StrumTs): string {
	if (ts === '6/8') return String((slot % 6) + 1);
	const per = perBeat(sub);
	const pos = slot % per;
	if (pos) return sub === 16 ? SIXTEENTH_COUNTS[pos] : '&';
	return String((Math.floor(slot / per) % strumMeter(slots, sub).beats) + 1);
}
