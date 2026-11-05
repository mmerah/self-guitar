// The listening mic: the shared raw stream (acquireMic in tuner/mic.ts: no echo cancellation,
// noise suppression or auto gain), an AudioWorklet that finds note onsets sample-accurately
// (onset.ts, run by onset.worklet.ts), and the pitch or chroma of each onset. Times are reported
// on the performance.now() clock, the clock the tab player's positions and screen taps use. Errors
// map to the tuner's explanations (tuner/mic.ts).
import { getAudioContext } from '$lib/audio/context';
import {
	acquireMic,
	classifyMicError,
	micPrecheck,
	releaseMic,
	type MicProblem
} from '$lib/tuner/mic';
import { pitchOf } from './pitchAt';
import { chromaOf } from './chroma';
// Built as its own script, served as a static file under the base path (CSP: 'self' is enough).
import workletUrl from './onset.worklet.ts?worker&url';

export type HeardOnset = {
	/** performance.now() time of the attack (as the audio graph received it). */
	perf: number;
	/** AudioContext time of the attack (s). */
	ctxTime: number;
	freq: number | null;
	clarity: number;
	/** 12-bin chroma, in chord mode. */
	chroma?: number[];
};

const PROCESSOR = 'sg-onsets'; // registered by onset.worklet.ts
const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

export const WORKLET_URL = workletUrl;

function loadWorklet(ctx: AudioContext): Promise<void> {
	let p = loaded.get(ctx);
	if (!p) {
		p = ctx.audioWorklet.addModule(workletUrl);
		p.catch(() => loaded.delete(ctx));
		loaded.set(ctx, p);
	}
	return p;
}

/**
 * The audio graph's clock against performance.now(): the smallest (perf − context time) seen is
 * the moment the graph processed a block (later readings caught a stale currentTime). A running
 * minimum over two alternating 5 s buckets, so slow drift between the clocks is followed.
 */
export class GraphClock {
	private cur = Infinity;
	private prev = Infinity;
	private since = -Infinity;
	constructor(private ctx: BaseAudioContext) {}
	sample() {
		const now = performance.now();
		if (now - this.since > 5000) {
			this.prev = this.cur;
			this.cur = Infinity;
			this.since = now;
		}
		const d = now - this.ctx.currentTime * 1000;
		if (d < this.cur) this.cur = d;
	}
	/** performance.now() time of an AudioContext time (s). */
	toPerf(t: number): number {
		this.sample();
		return Math.min(this.cur, this.prev) + t * 1000;
	}
}

/** Asks for the mic once (the permission prompt), then lets it go: the explainer's "Allow". */
export async function requestMicPermission(): Promise<MicProblem | null> {
	const pre = micPrecheck();
	if (pre) return pre;
	try {
		await acquireMic('mic-permission');
		return null;
	} catch (e) {
		return classifyMicError(e);
	} finally {
		releaseMic('mic-permission');
	}
}

export type ListenMode = 'notes' | 'chords' | 'onsets';

/** Listens for onsets until stopped. Call `start` from a tap (iOS). */
export class MicOnsets {
	private source: MediaStreamAudioSourceNode | null = null;
	private node: AudioWorkletNode | null = null;
	private sink: GainNode | null = null;
	private clock: GraphClock | null = null;
	private token = 0;
	private held = false;
	private heardAnything = false;
	private silentTimer: ReturnType<typeof setTimeout> | undefined;
	ctx: AudioContext | null = null;
	/** performance.now() when the stream arrived (end-to-end tests line their fake input up with it). */
	openedAt = 0;

	constructor(
		private handlers: {
			onset: (o: HeardOnset) => void;
			/** Ten times a second: rms and peak of the last 100 ms (performance.now() time). */
			level?: (rms: number, peak: number, perf: number) => void;
			/** The stream delivers only digital silence: the iOS glitch (MIC_HELP.silent). */
			problem?: (p: MicProblem) => void;
		},
		private mode: ListenMode = 'notes',
		/** Who holds the shared mic (tuner/mic.ts). */
		private owner = 'listen'
	) {}

	get running() {
		return !!this.node;
	}

	/** Opens the mic; resolves with a problem to explain, or null when listening. */
	async start(): Promise<MicProblem | null> {
		if (this.node) return null;
		const pre = micPrecheck();
		if (pre) return pre;
		const token = ++this.token;
		getAudioContext(); // inside the tap (iOS)
		let stream: MediaStream;
		this.held = true;
		try {
			stream = await acquireMic(this.owner);
		} catch (e) {
			this.held = false;
			return classifyMicError(e);
		}
		if (token !== this.token) return null;
		this.openedAt = performance.now();
		// Taken after the mic: the session switch may have rebuilt the context (context.ts).
		const ctx = getAudioContext();
		this.ctx = ctx;
		try {
			await loadWorklet(ctx);
		} catch {
			this.stop();
			return 'unsupported';
		}
		if (token !== this.token) return null;
		this.clock = new GraphClock(ctx);
		this.source = ctx.createMediaStreamSource(stream);
		this.node = new AudioWorkletNode(ctx, PROCESSOR, {
			numberOfInputs: 1,
			numberOfOutputs: 1,
			channelCount: 1,
			channelCountMode: 'explicit',
			processorOptions: { captureLength: this.mode === 'chords' ? 8192 : 4096 }
		});
		// A silent path to the output keeps the worklet pulled by the graph everywhere.
		this.sink = ctx.createGain();
		this.sink.gain.value = 0;
		this.source.connect(this.node).connect(this.sink).connect(ctx.destination);
		this.node.port.onmessage = (e) => this.message(e.data, ctx, token);
		await ctx.resume().catch(() => {});
		this.clock.sample();
		this.heardAnything = false;
		clearTimeout(this.silentTimer);
		this.silentTimer = setTimeout(() => {
			if (token === this.token && !this.heardAnything) this.handlers.problem?.('silent');
		}, 3000);
		return null;
	}

	private message(
		d: { type: string; frame: number; samples?: Float32Array; rms?: number; peak?: number },
		ctx: AudioContext,
		token: number
	) {
		if (token !== this.token || !this.clock) return;
		if (d.type === 'level') {
			if ((d.peak ?? 0) > 0) this.heardAnything = true;
			this.clock.sample();
			this.handlers.level?.(d.rms ?? 0, d.peak ?? 0, this.clock.toPerf(d.frame / ctx.sampleRate));
			return;
		}
		const ctxTime = d.frame / ctx.sampleRate;
		const samples = d.samples ?? new Float32Array(0);
		const perf = this.clock.toPerf(ctxTime);
		if (this.mode === 'chords') {
			this.handlers.onset({
				perf,
				ctxTime,
				freq: null,
				clarity: 0,
				chroma: samples.length >= 2048 ? chromaOf(samples, ctx.sampleRate) : undefined
			});
			return;
		}
		const p = this.mode === 'notes' ? pitchOf(samples, ctx.sampleRate) : null;
		this.handlers.onset({ perf, ctxTime, freq: p?.freq ?? null, clarity: p?.clarity ?? 0 });
	}

	stop() {
		this.token++;
		clearTimeout(this.silentTimer);
		if (this.node) this.node.port.onmessage = null;
		this.source?.disconnect();
		this.node?.disconnect();
		this.sink?.disconnect();
		if (this.held) releaseMic(this.owner);
		this.held = false;
		this.source = this.node = this.sink = null;
	}
}
