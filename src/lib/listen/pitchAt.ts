// The pitch of a note from the samples captured just after its onset: pitchy (MPM) on a few
// overlapping frames, with the tuner's frequency range, then an octave guard: every reading is
// folded into the octave of the median reading (most frames read the true note; the odd frame an
// octave off, at the attack or as a string dies, is pulled back), then the median. The checker
// then folds octave errors into the expected note's octave on purpose (match.ts): a beginner who
// plays the right note an octave off is not told it is wrong.
import { PitchDetector } from 'pitchy';
import { foldToOctaveOf, MAX_FREQ, median, MIN_FREQ } from '../tuner/pitch';

const FRAME = 2048;
const HOP = 512;
/** A little below the tuner's gate: one short note, not a sustained string. */
export const NOTE_CLARITY = 0.85;

let detector: PitchDetector<Float32Array> | null = null;

export type PitchReading = { freq: number; clarity: number } | null;

export function pitchOf(samples: Float32Array, sampleRate: number): PitchReading {
	if (samples.length < FRAME) return null;
	detector ??= PitchDetector.forFloat32Array(FRAME);
	detector.minVolumeDecibels = -60;
	const clear: { f: number; c: number }[] = [];
	for (let at = 0; at + FRAME <= samples.length; at += HOP) {
		const [f, c] = detector.findPitch(samples.subarray(at, at + FRAME), sampleRate);
		if (c >= NOTE_CLARITY && f >= MIN_FREQ && f <= MAX_FREQ) clear.push({ f, c });
	}
	if (!clear.length) return null;
	// Octave guard: fold every reading into the median reading's octave before the median.
	// (A real reading: the lower middle one when the count is even.)
	const sorted = clear.map((r) => r.f).sort((a, b) => a - b);
	const ref = sorted[(sorted.length - 1) >> 1];
	const folded = clear.map((r) => foldToOctaveOf(r.f, ref));
	return { freq: median(folded), clarity: median(clear.map((r) => r.c)) };
}
