// Plays ear-training questions with the app's plucked-string synth (a guitar-like timbre):
// single notes, a chord strummed low to high, a progression of strummed chords.
import { getAudioContext } from '$lib/audio/context';
import { claimPlayback, releasePlayback } from '$lib/audio/exclusive';
import { pluck, strum } from '$lib/audio/pluck';
import { midiToFreq } from '$lib/music/notes';

let stops: (() => void)[] = [];
const stopAll = () => {
	for (const s of stops) s();
	stops = [];
	releasePlayback(stopAll);
};

/** Stops whatever the trainer is playing. */
export const stopEar = stopAll;

function begin() {
	stopAll();
	claimPlayback(stopAll);
	return getAudioContext();
}

/** Notes one after the other `gap` seconds apart (or together); returns the duration in seconds. */
export function playNotes(midis: number[], opts: { together?: boolean; gap?: number } = {}) {
	const ctx = begin();
	const gap = opts.gap ?? 0.75;
	const t0 = ctx.currentTime + 0.03;
	midis.forEach((m, i) => {
		const when = opts.together ? t0 + i * 0.01 : t0 + i * gap;
		stops.push(pluck(ctx, midiToFreq(m), { when, gain: 0.55, seconds: 2.2, halfLife: 0.8 }));
	});
	return (opts.together ? 0 : (midis.length - 1) * gap) + 1;
}

/** A chord, strummed low to high. */
export function playChord(midis: number[]) {
	const ctx = begin();
	stops.push(...strum(ctx, midis.map(midiToFreq), 0.035, { seconds: 2.5 }));
	return 1.5;
}

/** Chords one per `beat` seconds; `onchord(i)` fires as each one sounds. */
export function playChords(chords: number[][], beat = 1.1, onchord?: (i: number) => void) {
	const ctx = begin();
	const t0 = ctx.currentTime + 0.05;
	chords.forEach((c, i) => {
		stops.push(...strum(ctx, c.map(midiToFreq), 0.03, { when: t0 + i * beat, seconds: 1.6 }));
		if (onchord) {
			const id = setTimeout(() => onchord(i), (0.05 + i * beat) * 1000);
			stops.push(() => clearTimeout(id));
		}
	});
	return chords.length * beat;
}
