// Validates alphaTex with alphaTab's own importer (runs in Node, no DOM needed).
import * as alphaTab from '@coderline/alphatab';
import { perBeat, strumMeterProblem, type Strum } from '../learn/strum.ts';
import type { StrumSlot } from '../learn/types.ts';

const SEVERITY = ['hint', 'warning', 'error'];

/** Returns human-readable problems; an empty array means the score is valid. */
export function checkAlphaTex(tex: string): string[] {
	const problems: string[] = [];
	const importer = new alphaTab.importer.AlphaTexImporter();
	importer.logErrors = false;
	importer.initFromString(tex, new alphaTab.Settings());

	let score: alphaTab.model.Score | undefined;
	try {
		score = importer.readScore();
	} catch (e) {
		if (!(e instanceof alphaTab.importer.AlphaTexErrorWithDiagnostics)) {
			problems.push(`import failed: ${(e as Error).message}`);
		}
	}

	const bags = [
		importer.lexerDiagnostics,
		importer.parserDiagnostics,
		importer.semanticDiagnostics
	];
	for (const bag of bags) {
		for (const d of bag.items) {
			if (d.severity < alphaTab.importer.alphaTex.AlphaTexDiagnosticsSeverity.Warning) continue;
			const at = d.start ? ` (line ${d.start.line}, col ${d.start.col})` : '';
			problems.push(`${SEVERITY[d.severity]} AT${d.code}${at}: ${d.message}`);
		}
	}
	if (!score) return problems.length ? problems : ['import failed'];

	// Every non-empty voice must fill its bar exactly (pickup bars may be shorter).
	for (const track of score.tracks) {
		for (const staff of track.staves) {
			for (const bar of staff.bars) {
				const expected = bar.masterBar.calculateDuration();
				for (const voice of bar.voices) {
					if (voice.isEmpty) continue;
					const actual = voice.beats.reduce((sum, b) => sum + b.playbackDuration, 0);
					const ok = bar.masterBar.isAnacrusis ? actual <= expected : actual === expected;
					if (!ok) {
						problems.push(
							`track "${track.name}" bar ${bar.index + 1} voice ${voice.index + 1}: ` +
								`duration ${actual} ticks, expected ${expected}`
						);
					}
				}
			}
		}
	}
	if (score.masterBars.length === 0) problems.push('score has no bars');
	return problems;
}

/** Bar count and whether the first bar is a pickup, for a (valid) alphaTex score. */
export function scoreShape(tex: string): { bars: number; pickup: boolean } {
	const importer = new alphaTab.importer.AlphaTexImporter();
	importer.logErrors = false;
	importer.initFromString(tex, new alphaTab.Settings());
	const bars = importer.readScore().masterBars;
	return { bars: bars.length, pickup: !!bars[0]?.isAnacrusis };
}

function readScore(tex: string): alphaTab.model.Score | null {
	const importer = new alphaTab.importer.AlphaTexImporter();
	importer.logErrors = false;
	importer.initFromString(tex, new alphaTab.Settings());
	try {
		return importer.readScore();
	} catch {
		return null;
	}
}

const asStrum = (strum: Strum | string[]): Strum =>
	Array.isArray(strum) ? { slots: strum as StrumSlot[], sub: 8 } : strum;

/**
 * Bars (1-based) whose strums do not land on the pattern's slots: the strum row under the tab
 * highlights the pattern's slots, so every bar must strum exactly those 8th (or 16th) notes (a
 * held half note where the row shows a strum would contradict it). A plain array is 8th notes.
 */
export function strumMismatches(tex: string, strum: Strum | string[]): number[] {
	const { slots, sub } = asStrum(strum);
	const score = readScore(tex);
	if (!score) return [];
	const unit = 960 / perBeat(sub); // alphaTab ticks: 960 per quarter note
	const out: number[] = [];
	for (const bar of score.tracks[0]?.staves[0]?.bars ?? []) {
		const perBar = Math.round(bar.masterBar.calculateDuration() / unit);
		if (!perBar || slots.length % perBar) {
			out.push(bar.index + 1);
			continue;
		}
		const offset = (bar.index % (slots.length / perBar)) * perBar;
		const want = slots
			.slice(offset, offset + perBar)
			.map((s, i) => (s === '-' ? -1 : i))
			.filter((i) => i >= 0);
		// A beat that only holds tied notes (a push ringing over the bar line) is no strum.
		const got = (bar.voices[0]?.beats ?? [])
			.filter((b) => !b.isRest && !b.isEmpty && !b.notes.every((n) => n.isTieDestination))
			.map((b) => b.playbackStart / unit);
		if (want.join() !== got.join()) out.push(bar.index + 1);
	}
	return out;
}

/**
 * Whether a strum pattern fits the score's time signature (one or two of its bars, in quarter-note
 * meters); null when it does, else the problem.
 */
export function strumMeterMismatch(tex: string, strum: Strum | string[]): string | null {
	const score = readScore(tex);
	if (!score) return null;
	const meters = new Set(
		score.masterBars.map((b) => `${b.timeSignatureNumerator}/${b.timeSignatureDenominator}`)
	);
	if (meters.size > 1)
		return `the score changes meter (${[...meters].join(', ')}); a strum row needs one`;
	const bar = score.masterBars[0];
	if (!bar) return null;
	return strumMeterProblem(
		asStrum(strum),
		bar.timeSignatureNumerator,
		bar.timeSignatureDenominator
	);
}
