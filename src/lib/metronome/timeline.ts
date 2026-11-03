// Pure timing math for the metronome (no Web Audio): which click happens when, accents,
// subdivisions, the speed trainer and tap tempo. Unit-tested; scheduler.ts plays it.

export const BPM_MIN = 30;
export const BPM_MAX = 250;

export const clampBpm = (v: number) => Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(v)));

export type TimeSignature = '2/4' | '3/4' | '4/4' | '6/8';
export const TIME_SIGNATURES: Record<TimeSignature, { beats: number; strong: number[] }> = {
	'2/4': { beats: 2, strong: [] },
	'3/4': { beats: 3, strong: [] },
	'4/4': { beats: 4, strong: [] },
	// Compound: six eighth-note clicks, secondary accent on the 4th.
	'6/8': { beats: 6, strong: [3] }
};

/** Clicks per beat: none, 8ths, triplets, 16ths. */
export type Subdivision = 1 | 2 | 3 | 4;
export const SUBDIVISIONS: { value: Subdivision; label: string }[] = [
	{ value: 1, label: 'None' },
	{ value: 2, label: '8ths' },
	{ value: 3, label: 'Triplets' },
	{ value: 4, label: '16ths' }
];

export type ClickLevel = 'accent' | 'strong' | 'beat' | 'sub';

export type Click = {
	/** AudioContext time, seconds. */
	time: number;
	/** 0-based bar count since start. */
	bar: number;
	beat: number;
	sub: number;
	level: ClickLevel;
	bpm: number;
};

export type TimelineSettings = {
	bpm: number;
	timeSignature: TimeSignature;
	subdivision: Subdivision;
	accent: boolean;
};

export const secondsPerBeat = (bpm: number) => 60 / bpm;

export function clickLevel(beat: number, sub: number, s: TimelineSettings): ClickLevel {
	if (sub > 0) return 'sub';
	if (beat === 0 && s.accent) return 'accent';
	if (s.accent && TIME_SIGNATURES[s.timeSignature].strong.includes(beat)) return 'strong';
	return 'beat';
}

/**
 * An endless sequence of clicks starting at `startTime`. Settings are read at every step, so a
 * tempo change takes effect from the next click without a gap or a jump.
 */
export class Timeline {
	private bar = 0;
	private beat = 0;
	private sub = 0;
	nextTime: number;
	private settings: () => TimelineSettings;

	// No parameter properties: the content scripts import this file with Node's type stripping.
	constructor(settings: () => TimelineSettings, startTime: number) {
		this.settings = settings;
		this.nextTime = startTime;
	}

	/**
	 * Wraps the position into the current settings, so switching 4/4 -> 3/4 on beat 4 (or 16ths
	 * -> 8ths mid-beat) goes on to the next downbeat instead of playing a beat that no longer exists.
	 */
	private wrap(s: TimelineSettings) {
		if (this.sub >= s.subdivision) {
			this.sub = 0;
			this.beat++;
		}
		if (this.beat >= TIME_SIGNATURES[s.timeSignature].beats) {
			this.beat = this.sub = 0;
			this.bar++;
		}
	}

	/** Returns the next click and advances past it. */
	next(): Click {
		const s = this.settings();
		this.wrap(s);
		const click: Click = {
			time: this.nextTime,
			bar: this.bar,
			beat: this.beat,
			sub: this.sub,
			level: clickLevel(this.beat, this.sub, s),
			bpm: s.bpm
		};
		this.nextTime += secondsPerBeat(s.bpm) / s.subdivision;
		this.sub++;
		this.wrap(s);
		return click;
	}

	/** The bar number if the next click is a downbeat, else null. */
	peekBar(): number | null {
		this.wrap(this.settings());
		return this.beat === 0 && this.sub === 0 ? this.bar : null;
	}
}

export type SpeedTrainer = { enabled: boolean; step: number; everyBars: number; target: number };

/** Tempo for bar `bar` (0-based, counted from the trainer's start) when it started at `startBpm`. */
export function trainerBpm(startBpm: number, bar: number, t: SpeedTrainer): number {
	if (!t.enabled || t.target <= startBpm) return startBpm;
	const steps = Math.floor(bar / Math.max(1, t.everyBars));
	return clampBpm(Math.min(t.target, startBpm + steps * t.step));
}

/** Bars until the trainer's next step after bar `bar`, or null once the target is reached. */
export function barsToNextStep(startBpm: number, bar: number, t: SpeedTrainer): number | null {
	if (trainerBpm(startBpm, bar, t) >= t.target) return null;
	const every = Math.max(1, t.everyBars);
	return every - (bar % every);
}

/**
 * Tempo from tap times (ms, oldest first): the average of the last few intervals.
 * Returns null until there are two taps; a pause over 2 s starts a new measurement.
 */
export function tapTempo(times: readonly number[], maxTaps = 5): number | null {
	const taps: number[] = [];
	for (let i = times.length - 1; i >= 0 && taps.length < maxTaps; i--) {
		if (taps.length && taps[0] - times[i] > 2000) break;
		taps.unshift(times[i]);
	}
	if (taps.length < 2) return null;
	const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
	return clampBpm(60000 / avg);
}
