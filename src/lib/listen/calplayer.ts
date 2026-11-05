// The latency test's clicks, played by alphaTab: its metronome over a short score of rests, so the
// test measures the same path the note checker scores (alphaTab's synth and output, its position
// events anchoring the beat on the performance.now() clock, the mic's onsets on that clock). The
// offset it finds is exactly what the checker must subtract. A hidden alphaTab instance; the
// SoundFont is loaded when the test opens, so Start plays at once.
import type * as AT from '@coderline/alphatab';
import { base } from '$app/paths';
import { anchorOf } from './checker';
import { CAL_BPM, CAL_CLICKS } from './latency';
import { QUARTER_TICKS, tempoMap, tickToMs, type TickLookupLike } from './timeline';

/** Two "get ready" clicks (a bar of 2/4) before the eight that are measured (two bars of 4/4). */
export const LEAD_CLICKS = 2;
const CAL_TEX = `\\tempo ${CAL_BPM}
\\track ("Click") { instrument acousticguitarsteel }
\\staff { tabs }
\\ts (2 4)
r.4 r.4 | \\ts (4 4) r.4 r.4 r.4 r.4 | r.4 r.4 r.4 r.4`;

export class CalPlayer {
	private api: AT.AlphaTabApi | null = null;
	private at: typeof AT | null = null;
	private samples: number[] = [];
	private off: (() => void)[] = [];
	private destroyed = false;
	private playing = false;
	/** Resolves when the synth can play (SoundFont in). */
	readonly ready: Promise<void>;

	constructor(
		host: HTMLElement,
		private handlers: {
			/** A metronome beat sounded (0-based, lead clicks included), roughly when heard. */
			beat?: (i: number) => void;
			/** The score played to its end. */
			finished?: () => void;
		} = {}
	) {
		this.ready = this.load(host);
	}

	private async load(host: HTMLElement) {
		const at = await import('@coderline/alphatab');
		if (this.destroyed) return;
		this.at = at;
		const api = new at.AlphaTabApi(host, {
			core: { fontDirectory: `${base}/font/`, engine: 'svg' },
			display: { scale: 0.5 },
			player: {
				playerMode: at.PlayerMode.EnabledSynthesizer,
				soundFont: `${base}/soundfont/sonivox.sf3.bin`,
				scrollMode: at.ScrollMode.Off,
				enableCursor: false
			}
		} as AT.json.SettingsJson);
		this.api = api;
		const ready = new Promise<void>((resolve) => this.off.push(api.playerReady.on(resolve)));
		let lastBeat = -1;
		this.off.push(
			api.playerPositionChanged.on((e) => {
				if (!this.playing) return;
				const now = performance.now();
				if (e.currentTick > 0) this.samples.push(now - this.ms(e.currentTick));
				const beat = Math.floor(e.currentTick / QUARTER_TICKS);
				if (beat !== lastBeat && beat < LEAD_CLICKS + CAL_CLICKS) {
					lastBeat = beat;
					this.handlers.beat?.(beat);
				}
			}),
			api.playerStateChanged.on((e) => {
				this.playing = e.state === at.synth.PlayerState.Playing;
				if (!this.playing) lastBeat = -1;
			}),
			api.playerFinished.on(() => this.handlers.finished?.())
		);
		api.tex(CAL_TEX);
		await ready;
	}

	private ms(tick: number) {
		const lookup = this.api?.tickCache as unknown as TickLookupLike | null;
		return lookup ? tickToMs(tick, tempoMap(lookup, CAL_BPM)) : (tick * 60000) / (960 * CAL_BPM);
	}

	/** Plays the clicks (call from the tap that starts the test). */
	play() {
		const api = this.api;
		if (!api) return false;
		this.samples = [];
		api.countInVolume = 0;
		api.metronomeVolume = 1;
		api.masterVolume = 1;
		api.isLooping = false;
		api.playbackSpeed = 1;
		api.tickPosition = 0;
		api.play();
		return true;
	}

	stop() {
		this.api?.stop();
	}

	/** performance.now() of tick 0, from the position events as the checker places a pass. */
	anchor(): number | null {
		return anchorOf(this.samples);
	}

	/** performance.now() times of the measured clicks (null before any position came in). */
	clicks(): number[] | null {
		const a = this.anchor();
		if (a === null) return null;
		return Array.from(
			{ length: CAL_CLICKS },
			(_, i) => a + this.ms((LEAD_CLICKS + i) * QUARTER_TICKS)
		);
	}

	destroy() {
		this.destroyed = true;
		this.off.forEach((f) => f());
		this.off = [];
		this.api?.destroy();
		this.api = null;
	}
}
