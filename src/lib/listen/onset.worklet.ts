// The listening mic's AudioWorklet: OnsetDetector on every 128-frame block, posting each onset
// (with its captured samples) and a level reading ten times a second. Built by Vite as its own
// script and served as a static file under the app's base path (mic.ts loads it with
// `?worker&url`): no Blob URL, so a Content-Security-Policy needs nothing beyond 'self'.
import { OnsetDetector } from './onset';

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
	readonly port: MessagePort;
	constructor(options?: unknown);
}

const PROCESSOR = 'sg-onsets'; // mic.ts names it too

class OnsetProcessor extends AudioWorkletProcessor {
	private detector: OnsetDetector;
	private levelEvery = Math.round(sampleRate / 10);
	private count = 0;
	private sq = 0;
	private peak = 0;

	constructor(options?: { processorOptions?: { captureLength?: number } }) {
		super();
		const o = options?.processorOptions ?? {};
		this.detector = new OnsetDetector({ sampleRate, ...o });
		this.port.onmessage = (e: MessageEvent) => {
			if (e.data?.captureLength) this.detector.captureLength = e.data.captureLength;
		};
	}

	process(inputs: Float32Array[][]) {
		const ch = inputs[0]?.[0];
		if (!ch) return true;
		// currentFrame: the worklet global's frame counter at this block's start.
		const frame0 = (globalThis as unknown as { currentFrame: number }).currentFrame;
		for (const ev of this.detector.process(ch, frame0))
			this.port.postMessage({ type: 'onset', frame: ev.frame, samples: ev.samples });
		for (let i = 0; i < ch.length; i++) {
			this.sq += ch[i] * ch[i];
			const a = Math.abs(ch[i]);
			if (a > this.peak) this.peak = a;
		}
		this.count += ch.length;
		if (this.count >= this.levelEvery) {
			this.port.postMessage({
				type: 'level',
				rms: Math.sqrt(this.sq / this.count),
				peak: this.peak,
				frame: frame0
			});
			this.count = this.sq = this.peak = 0;
		}
		return true;
	}
}

registerProcessor(PROCESSOR, OnsetProcessor);
