// Lookahead metronome (Chris Wilson, "A Tale of Two Clocks"): a Worker timer wakes every ~25 ms
// and schedules every click due in the next ~100 ms on the AudioContext clock, so timing stays
// sample-accurate even when the main thread is busy. Reusable: lessons and sessions embed it.
import {
	barsToNextStep,
	Timeline,
	trainerBpm,
	type Click,
	type SpeedTrainer,
	type TimelineSettings
} from './timeline';

export const TICK_MS = 25;
export const LOOKAHEAD_S = 0.1;

const WORKER_SRC = `let id = null;
onmessage = (e) => {
	clearInterval(id);
	id = e.data === 'start' ? setInterval(() => postMessage('tick'), ${TICK_MS}) : null;
};`;

/** A ticker in a Worker (not throttled like main-thread timers); main-thread fallback. */
function createTicker(onTick: () => void) {
	try {
		const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
		const worker = new Worker(url);
		URL.revokeObjectURL(url);
		worker.onmessage = onTick;
		return {
			start: () => worker.postMessage('start'),
			stop: () => worker.postMessage('stop'),
			destroy: () => worker.terminate()
		};
	} catch {
		let id: ReturnType<typeof setInterval> | undefined;
		return {
			start: () => (id = setInterval(onTick, TICK_MS)),
			stop: () => clearInterval(id),
			destroy: () => clearInterval(id)
		};
	}
}

const CLICK_SOUND = {
	accent: { freq: 1760, gain: 0.9 },
	strong: { freq: 1320, gain: 0.7 },
	beat: { freq: 1100, gain: 0.6 },
	sub: { freq: 880, gain: 0.3 }
} as const;

/** A short sine "blip" with a fast exponential decay. */
export function playClick(ctx: AudioContext, time: number, level: Click['level']) {
	const { freq, gain } = CLICK_SOUND[level];
	const osc = ctx.createOscillator();
	const env = ctx.createGain();
	osc.frequency.value = freq;
	env.gain.setValueAtTime(0.0001, time);
	env.gain.exponentialRampToValueAtTime(gain, time + 0.002);
	env.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
	osc.connect(env).connect(ctx.destination);
	osc.start(time);
	osc.stop(time + 0.06);
}

export type MetronomeOptions = {
	settings: () => TimelineSettings;
	trainer?: () => SpeedTrainer;
	/** Called (on the main thread, in sync with the sound) for every click as it is heard. */
	onClick?: (click: Click) => void;
	/** Optional replacement for the default click sound (the click says which beat it is). */
	sound?: (ctx: AudioContext, time: number, level: Click['level'], click: Click) => void;
};

export class Metronome {
	private timeline: Timeline | null = null;
	private ticker: ReturnType<typeof createTicker> | null = null;
	private queue: Click[] = [];
	private raf = 0;
	/** Speed trainer ramp origin: the user's tempo and the bar it started at (null = not set). */
	private anchor: { bpm: number; bar: number } | null = null;
	/** The trainer's tempo, playing instead of the user's (never written back to the settings). */
	private bpmOverride: number | null = null;

	constructor(
		readonly ctx: AudioContext,
		private opts: MetronomeOptions
	) {}

	get running() {
		return this.timeline !== null;
	}

	/** Settings with the speed trainer's tempo applied. */
	private current = (): TimelineSettings => {
		const s = this.opts.settings();
		return this.bpmOverride === null ? s : { ...s, bpm: this.bpmOverride };
	};

	start() {
		if (this.timeline) return;
		this.anchor = this.bpmOverride = null;
		this.timeline = new Timeline(this.current, this.ctx.currentTime + 0.06);
		this.ticker ??= createTicker(() => this.schedule());
		this.ticker.start();
		this.schedule();
		this.raf = requestAnimationFrame(this.draw);
	}

	stop() {
		this.timeline = null;
		this.ticker?.stop();
		this.queue = [];
		cancelAnimationFrame(this.raf);
		this.anchor = this.bpmOverride = null;
	}

	destroy() {
		this.stop();
		this.ticker?.destroy();
		this.ticker = null;
	}

	/**
	 * The user set the tempo: it applies from the next click, and the speed trainer restarts its
	 * ramp from it at the next downbeat.
	 */
	userTempo() {
		this.anchor = this.bpmOverride = null;
	}

	/** Bars until the trainer's next step, as of `bar`; null when off or at the target. */
	barsToNextStep(bar: number): number | null {
		const trainer = this.opts.trainer?.();
		if (!trainer?.enabled || !this.anchor) return null;
		return barsToNextStep(this.anchor.bpm, bar - this.anchor.bar, trainer);
	}

	/** Schedules every click due within the lookahead window (run by the ticker). */
	schedule() {
		if (!this.timeline) return;
		const now = this.ctx.currentTime;
		// After a stall (iOS interruption, suspended context) restart from now, not with a burst.
		if (this.timeline.nextTime < now) this.timeline.nextTime = now + 0.05;
		while (this.timeline.nextTime < now + LOOKAHEAD_S) {
			this.applyTrainer();
			const click = this.timeline.next();
			(this.opts.sound ?? playClick)(this.ctx, click.time, click.level, click);
			this.queue.push(click);
		}
		// Clicks already heard are only drawn by `draw` (rAF): drop all but the latest, so the
		// queue doesn't grow while the tab is hidden.
		while (this.queue.length > 1 && this.queue[1].time <= now) this.queue.shift();
	}

	/** Speed trainer: before each downbeat, set the tempo for the coming bar. */
	private applyTrainer() {
		const upcoming = this.timeline?.peekBar() ?? null;
		if (upcoming === null) return;
		const trainer = this.opts.trainer?.();
		if (!trainer?.enabled) {
			this.anchor = this.bpmOverride = null;
			return;
		}
		this.anchor ??= { bpm: this.opts.settings().bpm, bar: upcoming };
		const bpm = trainerBpm(this.anchor.bpm, upcoming - this.anchor.bar, trainer);
		this.bpmOverride = bpm === this.anchor.bpm ? null : bpm;
	}

	private draw = () => {
		const now = this.ctx.currentTime;
		let last: Click | undefined;
		while (this.queue.length && this.queue[0].time <= now) last = this.queue.shift();
		if (last) this.opts.onClick?.(last);
		if (this.timeline) this.raf = requestAnimationFrame(this.draw);
	};
}
