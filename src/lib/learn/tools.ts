// `::tool{name=... }` link cards: which attributes each tool takes and the URL they open.
import {
	canonicalChordRef,
	chordRef,
	chordRefProblem,
	getChord,
	splitChordRef
} from '../chords/index.ts';
import { BPM_MAX, BPM_MIN, TIME_SIGNATURES } from '../metronome/timeline.ts';
import { TUNINGS } from '../tuner/tunings.ts';
import type { Mastery, ToolName } from './types.ts';
import { EAR_KINDS, EAR_TITLE, isEarKind, parseEarSet } from '../ear/items.ts';
import { isQuiz, quizSpec } from '../fretboard/quiz.ts';
import { FRETBOARD_ATTRS, overlay, parseFretboard } from '../theory/fretboard.ts';

type ParamCheck = (v: string) => string | null; // problem, or null when valid

const intIn =
	(min: number, max: number): ParamCheck =>
	(v) =>
		/^\d+$/.test(v) && +v >= min && +v <= max ? null : `must be a whole number ${min}-${max}`;
const oneOf =
	(values: readonly string[]): ParamCheck =>
	(v) =>
		values.includes(v) ? null : `must be one of ${values.join(', ')}`;
/** A chord, optionally with the voicing to show ("F@1-3-3-2-1-1"). */
const chord: ParamCheck = (v) => chordRefProblem(v);
const chordIdOf = (ref: string | undefined) => getChord(splitChordRef(ref ?? '').name)?.id;

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
	},
	ear: {
		title: 'Ear trainer',
		text: 'Intervals, chords, progressions',
		params: {
			kind: oneOf(EAR_KINDS),
			// Checked against the kind by toolProblems.
			set: (v) => (/^[\w,]+$/.test(v) ? null : 'must be a comma-separated list')
		},
		required: ['kind']
	},
	fretboard: {
		title: 'Fretboard',
		text: 'Scales, shapes and notes on the neck',
		params: {
			...Object.fromEntries(FRETBOARD_ATTRS.map((k) => [k, () => null])),
			quiz: (v) => (isQuiz(v) ? null : 'unknown quiz')
		},
		required: []
	}
};

/** Cross-attribute checks of a tool card (an ear set must fit its kind; an overlay must parse). */
export function toolProblems(name: ToolName, params: Record<string, string>): string[] {
	const problems: string[] = [];
	if (name === 'ear' && params.set !== undefined && isEarKind(params.kind ?? ''))
		parseEarSet(params.kind as (typeof EAR_KINDS)[number], params.set, problems);
	if (name === 'fretboard') {
		const { quiz, ...rest } = params;
		if (quiz !== undefined && Object.keys(rest).length) problems.push('quiz= stands alone');
		if (quiz === undefined && Object.keys(rest).length) parseFretboard(rest, problems);
	}
	return problems;
}

/** Where a tool link was opened from: the lesson (for the way back) and its mastery goal. */
export type ToolContext = { from?: string; target?: number };

/**
 * The tool's URL with its preset. Changes pairs use canonical chord names, with the voicing when
 * one is picked ("F@1-3-3-2-1-1"), so the tool's own validation accepts them; `from` and `target`
 * come from the lesson that links it.
 */
export function toolHref(name: ToolName, params: Record<string, string>, ctx: ToolContext = {}) {
	const q = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) {
		q.set(k, name === 'changes' && (k === 'a' || k === 'b') ? (canonicalChordRef(v) ?? v) : v);
	}
	if (ctx.target !== undefined) q.set('target', String(ctx.target));
	if (ctx.from) q.set('from', ctx.from);
	const qs = q.toString();
	return `/tools/${name}${qs ? `?${qs}` : ''}`;
}

/** A lesson's changes goal applies to a changes tool card for the same pair (any spelling/order). */
export function changesTarget(mastery: Mastery | undefined, params: Record<string, string>) {
	if (mastery?.type !== 'changes') return undefined;
	const pair = [chordIdOf(params.a), chordIdOf(params.b)].sort().join('|');
	return pair === [chordIdOf(mastery.a), chordIdOf(mastery.b)].sort().join('|')
		? mastery.target
		: undefined;
}

/** Short summary of the preset, e.g. "C – G" or "70 BPM". */
export function toolPreset(name: ToolName, params: Record<string, string>): string {
	if (name === 'changes') {
		// A picked voicing shows its label ("C – F (E-shape barre)").
		const show = (ref: string) => {
			const r = chordRef(ref);
			const label = splitChordRef(ref).voicing !== undefined && r?.voicing.label;
			return `${r?.chord.id}${label ? ` (${label})` : ''}`;
		};
		return `${show(params.a)} – ${show(params.b)}`;
	}
	if (name === 'metronome')
		return [params.bpm && `${params.bpm} BPM`, params.ts, params.sub === '2' && '8ths']
			.filter(Boolean)
			.join(' · ');
	if (name === 'tuner' && params.tuning)
		return TUNINGS.find((t) => t.id === params.tuning)?.name ?? '';
	if (name === 'ear' && isEarKind(params.kind ?? ''))
		return `${EAR_TITLE[params.kind as (typeof EAR_KINDS)[number]]}${params.set ? ` · ${params.set.split(',').join(' ')}` : ''}`;
	if (name === 'fretboard') {
		if (params.quiz && isQuiz(params.quiz)) return quizSpec(params.quiz).title;
		const spec = parseFretboard(params, []);
		if (spec) return overlay(spec).title;
	}
	return '';
}
