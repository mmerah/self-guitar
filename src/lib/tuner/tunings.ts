import { centsBetween, midiToFreq, noteToMidi } from '../music/notes.ts';

export type Tuning = {
	id: string;
	name: string;
	/** Low (6th) string first, scientific pitch notation. */
	notes: readonly string[];
};

// Data-driven: add a tuning here and it shows up in the tuner.
export const TUNINGS: readonly Tuning[] = [
	{ id: 'standard', name: 'Standard', notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
	{ id: 'drop-d', name: 'Drop D', notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
	{ id: 'dadgad', name: 'DADGAD', notes: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'] },
	{ id: 'open-g', name: 'Open G', notes: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'] },
	{ id: 'open-d', name: 'Open D', notes: ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4'] }
];

export function getTuning(id: string): Tuning {
	return TUNINGS.find((t) => t.id === id) ?? TUNINGS[0];
}

export const stringFreqs = (t: Tuning) => t.notes.map((n) => midiToFreq(noteToMidi(n)));

/**
 * The string (index, low string = 0) whose target pitch is closest to `freq`, in cents.
 * Absolute pitch, never pitch class: in Drop D a low D2 matches string 6, not the D3 string.
 */
export function nearestString(freq: number, tuning: Tuning): { index: number; cents: number } {
	let best = { index: 0, cents: Infinity };
	stringFreqs(tuning).forEach((target, index) => {
		const cents = centsBetween(freq, target);
		if (Math.abs(cents) < Math.abs(best.cents)) best = { index, cents };
	});
	return best;
}

/** In-tune window, in cents either side of the target. */
export const IN_TUNE_CENTS = 5;
/** Beyond the in-tune window but close: amber, not red. */
export const CLOSE_CENTS = 20;

export const centsTone = (cents: number): 'ok' | 'warn' | 'danger' =>
	Math.abs(cents) <= IN_TUNE_CENTS ? 'ok' : Math.abs(cents) <= CLOSE_CENTS ? 'warn' : 'danger';
