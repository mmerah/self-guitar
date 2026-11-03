// `::tool{name=... }` link cards: which attributes each tool takes and the URL they open.
import { getChord } from '../chords/index.ts';
import { BPM_MAX, BPM_MIN, TIME_SIGNATURES } from '../metronome/timeline.ts';
import { TUNINGS } from '../tuner/tunings.ts';
import type { Mastery, ToolName } from './types.ts';

type ParamCheck = (v: string) => string | null; // problem, or null when valid

const intIn =
	(min: number, max: number): ParamCheck =>
	(v) =>
		/^\d+$/.test(v) && +v >= min && +v <= max ? null : `must be a whole number ${min}-${max}`;
const oneOf =
	(values: readonly string[]): ParamCheck =>
	(v) =>
		values.includes(v) ? null : `must be one of ${values.join(', ')}`;
const chord: ParamCheck = (v) => (getChord(v) ? null : `unknown chord "${v}"`);

export const TOOLS: Record<
	ToolName,
	{ title: string; text: string; params: Record<string, ParamCheck>; required: string[] }
> = {
	tuner: {
		title: 'Tuner',
		text: 'Tune all six strings',
		params: { tuning: oneOf(TUNINGS.map((t) => t.id)) },
		required: []
	},
	metronome: {
		title: 'Metronome',
		text: 'Practise with a steady click',
		params: {
			bpm: intIn(BPM_MIN, BPM_MAX),
			ts: oneOf(Object.keys(TIME_SIGNATURES)),
			sub: oneOf(['1', '2', '3', '4'])
		},
		required: []
	},
	changes: {
		title: '1-minute changes',
		text: 'Count your changes in one minute',
		params: { a: chord, b: chord },
		required: ['a', 'b']
	}
};

/** Where a tool link was opened from: the lesson (for the way back) and its mastery goal. */
export type ToolContext = { from?: string; target?: number };

/**
 * The tool's URL with its preset. Changes pairs use canonical chord names (so the tool's own
 * validation accepts them); `from` and `target` come from the lesson that links it.
 */
export function toolHref(name: ToolName, params: Record<string, string>, ctx: ToolContext = {}) {
	const q = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) {
		q.set(k, name === 'changes' && (k === 'a' || k === 'b') ? (getChord(v)?.id ?? v) : v);
	}
	if (ctx.target !== undefined) q.set('target', String(ctx.target));
	if (ctx.from) q.set('from', ctx.from);
	const qs = q.toString();
	return `/tools/${name}${qs ? `?${qs}` : ''}`;
}

/** A lesson's changes goal applies to a changes tool card for the same pair (any spelling/order). */
export function changesTarget(mastery: Mastery | undefined, params: Record<string, string>) {
	if (mastery?.type !== 'changes') return undefined;
	const id = (c: string | undefined) => getChord(c ?? '')?.id;
	const pair = [id(params.a), id(params.b)].sort().join('|');
	return pair === [id(mastery.a), id(mastery.b)].sort().join('|') ? mastery.target : undefined;
}

/** Short summary of the preset, e.g. "C – G" or "70 BPM". */
export function toolPreset(name: ToolName, params: Record<string, string>): string {
	if (name === 'changes') return `${getChord(params.a)?.id} – ${getChord(params.b)?.id}`;
	if (name === 'metronome')
		return [params.bpm && `${params.bpm} BPM`, params.ts, params.sub === '2' && '8ths']
			.filter(Boolean)
			.join(' · ');
	if (name === 'tuner' && params.tuning)
		return TUNINGS.find((t) => t.id === params.tuning)?.name ?? '';
	return '';
}
