// Turns raw per-frame pitch estimates into a stable reading: clarity gate, octave-error guard
// and median smoothing. Pure (no Web Audio), so it is unit-tested directly.
//
// Octave errors: on a decaying low string the fundamental often dies before the 2nd harmonic,
// so the detector reads the octave above (E2 -> E3) for seconds. Once a note is established the
// tracker *holds* it: a reading ~2x or ~1/2x the held pitch is folded back into the held octave
// for as long as the note lasts. It re-anchors only on a new onset (an energy rise, from `rms`),
// after the note fades out (several unclear frames), or after a very long octave shift.
// One exception: early in a note a reading an octave *below* wins, because the attack is where
// the detector reads high (sub-octave errors are rare with MPM).

export const MIN_FREQ = 60; // below drop-C low string
export const MAX_FREQ = 1400; // ~fret 20 on the high E string
export const CLARITY_GATE = 0.9;
/** Frames (~16 ms each) after a note starts during which a lower-octave reading re-anchors down. */
const ATTACK_FRAMES = 15;
/** An onset: the signal level jumps to this many times its recent minimum. */
const ONSET_RATIO = 2;
const ONSET_FLOOR = 0.003; // rms below this is room noise, never an onset
const RMS_FRAMES = 8;

export function median(values: readonly number[]): number {
	const s = [...values].sort((a, b) => a - b);
	const mid = s.length >> 1;
	return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** True when a/b is within `tol` (relative) of `ratio`. */
const near = (a: number, b: number, ratio: number, tol = 0.03) => Math.abs(a / b / ratio - 1) < tol;

/** Moves `freq` by whole octaves to the octave closest to `target` (for a locked string). */
export function foldToOctaveOf(freq: number, target: number): number {
	const k = Math.round(Math.log2(target / freq));
	return freq * 2 ** k;
}

export type TrackerOptions = {
	/** Frames kept for the median. */
	window?: number;
	/** Consecutive octave-shifted frames (without an onset) before the shift is believed. */
	octaveHold?: number;
	/** Consecutive unclear frames before the note is forgotten. */
	resetAfter?: number;
	clarity?: number;
};

export type PushOptions = {
	/** A locked string's frequency: every reading is folded into its octave. */
	target?: number;
	/** Signal level of the frame (root mean square), used to detect a new pluck. */
	rms?: number;
};

export class PitchTracker {
	/** Octave-corrected readings of the current note (newest last). */
	private history: number[] = [];
	private noteFrames = 0;
	private octaveStreak = 0;
	private unclear = 0;
	private levels: number[] = [];
	private readonly window: number;
	private readonly octaveHold: number;
	private readonly resetAfter: number;
	private readonly clarity: number;

	constructor(opts: TrackerOptions = {}) {
		this.window = opts.window ?? 5;
		this.octaveHold = opts.octaveHold ?? 240; // ~4 s: longer than a plucked string's decay
		this.resetAfter = opts.resetAfter ?? 10;
		this.clarity = opts.clarity ?? CLARITY_GATE;
	}

	reset() {
		this.history = [];
		this.noteFrames = this.octaveStreak = this.unclear = 0;
	}

	private onset(rms: number): boolean {
		const quietest = this.levels.length ? Math.min(...this.levels) : rms;
		this.levels.push(rms);
		if (this.levels.length > RMS_FRAMES) this.levels.shift();
		return rms > ONSET_FLOOR && rms > ONSET_RATIO * quietest;
	}

	/**
	 * Feeds one detector frame. Returns the smoothed frequency, or null while there is no
	 * trustworthy pitch (silence, noise, an unclear frame, or not enough frames yet).
	 */
	push(freq: number, clarity: number, { target, rms }: PushOptions = {}): number | null {
		if (rms !== undefined && this.onset(rms)) this.reset();
		if (!(clarity >= this.clarity) || !(freq >= MIN_FREQ && freq <= MAX_FREQ)) {
			// Keep the held note through a short dip; forget it once the sound has really gone.
			if (++this.unclear >= this.resetAfter) this.reset();
			return null;
		}
		this.unclear = 0;
		let f = target ? foldToOctaveOf(freq, target) : freq;
		if (this.history.length) {
			// Octave correction happens before the median, so it never averages two octaves.
			const held = median(this.history);
			const octaveOff = near(f, held, 2) || near(f, held, 0.5);
			if (octaveOff && f < held && this.noteFrames < ATTACK_FRAMES) {
				// The attack was read an octave high: the lower reading is the real note.
				this.history = this.history.map((h) => foldToOctaveOf(h, f));
			} else if (octaveOff && ++this.octaveStreak < this.octaveHold) {
				f = foldToOctaveOf(f, held);
			} else if (octaveOff) {
				this.reset(); // a very long, steady shift: believe it
			} else {
				this.octaveStreak = 0;
				// A different note (string change): restart smoothing so the old note doesn't lag.
				if (!near(f, held, 1, 0.06)) this.reset();
			}
		}
		this.history.push(f);
		if (this.history.length > this.window) this.history.shift();
		this.noteFrames++;
		return this.history.length >= 2 ? median(this.history) : null;
	}
}

/** Root mean square level of a frame of samples. */
export function rmsOf(buf: Float32Array): number {
	let sum = 0;
	for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
	return Math.sqrt(sum / buf.length);
}
