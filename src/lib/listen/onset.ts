// Onset detection for plucked notes, block by block (an AudioWorklet's 128-frame blocks). Pure and
// self-contained (it runs inside the worklet, onset.worklet.ts, and in Node for the unit tests).
//
// Feature: energy plus high-passed energy (a pick attack is broadband, a ringing string is not),
// summed over the last `window` blocks (longer than one period of the low E, so a ringing note
// reads steady). An onset is the feature jumping to `ratio` times its minimum over the recent
// past, above an absolute floor, at least `refractory` after the previous onset. Its time is the
// first sample of the attack, found in the blocks just before. On an onset the detector also
// captures `captureLength` samples from `captureDelay` after it (past the attack) for pitch or
// chroma analysis.
//
// The audio thread must not allocate per block (garbage collection there glitches the audio):
// recent blocks, window sums and the feature history live in preallocated rings, and `process`
// returns the same (reused) array each call. The only allocation is one capture buffer per onset.

export type OnsetEvent = {
	/** Absolute frame of the onset (first sample of the attack). */
	frame: number;
	/** Captured samples after the onset (shorter when the next onset came first). */
	samples: Float32Array;
};

export type OnsetOptions = {
	sampleRate: number;
	ratio?: number;
	/** Per-sample feature below this is silence (≈ rms 0.003). */
	floor?: number;
	/** Seconds. */
	refractory?: number;
	/** Seconds of past feature values the minimum is taken over. */
	memory?: number;
	/** Seconds after the onset before capturing. */
	captureDelay?: number;
	/** Samples captured per onset (0: none). */
	captureLength?: number;
};

const BLOCK = 128;
const EMPTY = new Float32Array(0);

export class OnsetDetector {
	sampleRate: number;
	ratio: number;
	floor: number;
	refractory: number;
	window: number;
	memory: number;
	captureDelay: number;
	captureLength: number;
	lastOnset: number;
	prev: number;

	// Recent blocks (the last `window + 1`), oldest at `rHead`: samples, start frame, feature sum.
	private rCap: number;
	private rSize = BLOCK;
	private rData: Float32Array;
	private rLen: Int32Array;
	private rFrame: Float64Array;
	private rSum: Float64Array;
	private rHead = 0;
	private rCount = 0;
	// Per-block feature sums of the current window (ring).
	private wSums: Float64Array;
	private wHead = 0;
	private wCount = 0;
	// Windowed feature history before the current window (ring); its minimum is the quiet level.
	private past: Float64Array;
	private pHead = 0;
	private pCount = 0;
	private capture: { frame: number; start: number; buf: Float32Array; filled: number } | null;
	private out: OnsetEvent[] = [];

	constructor(opts: OnsetOptions) {
		this.sampleRate = opts.sampleRate;
		this.ratio = opts.ratio ?? 3;
		this.floor = opts.floor ?? 1e-5;
		this.refractory = Math.round((opts.refractory ?? 0.07) * opts.sampleRate);
		// ~21 ms at 48 kHz: one and a half periods of a low E.
		this.window = Math.max(2, Math.round((0.021 * opts.sampleRate) / BLOCK));
		this.memory = Math.max(2, Math.round(((opts.memory ?? 0.04) * opts.sampleRate) / BLOCK));
		this.captureDelay = Math.round((opts.captureDelay ?? 0.02) * opts.sampleRate);
		this.captureLength = opts.captureLength ?? 4096;
		this.lastOnset = -Infinity;
		this.prev = 0;
		this.capture = null;
		this.rCap = this.window + 1;
		this.rData = new Float32Array(this.rCap * this.rSize);
		this.rLen = new Int32Array(this.rCap);
		this.rFrame = new Float64Array(this.rCap);
		this.rSum = new Float64Array(this.rCap);
		this.wSums = new Float64Array(this.window);
		this.past = new Float64Array(this.memory);
	}

	/** Ring slot of the k-th recent block, oldest first. */
	private slot(k: number) {
		return (this.rHead + k) % this.rCap;
	}

	private pushRecent(block: Float32Array, frame0: number, sum: number) {
		if (block.length > this.rSize) {
			// Larger blocks than a worklet's (tests, other hosts): grow once, keeping nothing.
			this.rSize = block.length;
			this.rData = new Float32Array(this.rCap * this.rSize);
			this.rHead = this.rCount = 0;
		}
		let s: number;
		if (this.rCount < this.rCap) s = this.slot(this.rCount++);
		else {
			s = this.rHead;
			this.rHead = (this.rHead + 1) % this.rCap;
		}
		this.rData.set(block, s * this.rSize);
		this.rLen[s] = block.length;
		this.rFrame[s] = frame0;
		this.rSum[s] = sum;
	}

	private windowSum() {
		let a = 0;
		for (let i = 0; i < this.wCount; i++) a += this.wSums[i];
		return a;
	}

	private quietest() {
		if (!this.pCount) return Infinity;
		let m = Infinity;
		for (let i = 0; i < this.pCount; i++) if (this.past[i] < m) m = this.past[i];
		return m;
	}

	/**
	 * Feeds one block starting at absolute frame `frame0`; returns finished captures. The returned
	 * array is reused by the next call: read (or copy) it before feeding more.
	 */
	process(block: Float32Array, frame0: number): OnsetEvent[] {
		const out = this.out;
		out.length = 0;
		let sum = 0;
		let prev = this.prev;
		for (let i = 0; i < block.length; i++) {
			const x = block[i];
			const d = x - prev;
			prev = x;
			sum += x * x + 25 * d * d;
		}
		const startPrev = this.prev;
		this.prev = block.length ? block[block.length - 1] : this.prev;
		this.pushRecent(block, frame0, sum);

		const norm = this.window * BLOCK;
		// The window that just ended moves into the past.
		if (this.wCount >= this.window) {
			this.past[this.pHead] = this.windowSum() / norm;
			this.pHead = (this.pHead + 1) % this.memory;
			if (this.pCount < this.memory) this.pCount++;
			this.wSums[this.wHead] = sum;
			this.wHead = (this.wHead + 1) % this.window;
		} else this.wSums[this.wCount++] = sum;
		const feature = this.windowSum() / norm;
		const quietest = this.quietest();

		const isOnset =
			feature > this.floor &&
			feature > this.ratio * Math.max(quietest, this.floor / 4) &&
			frame0 - this.lastOnset >= this.refractory;
		if (isOnset) {
			const frame = this.attackFrame(quietest, startPrev);
			if (this.capture) out.push(this.finish());
			this.lastOnset = frame;
			if (this.captureLength > 0) {
				const c = {
					frame,
					start: frame + this.captureDelay,
					buf: new Float32Array(this.captureLength),
					filled: 0
				};
				this.capture = c;
				// Re-feed the recent blocks into the capture (the delay may already have passed).
				for (let k = 0; k < this.rCount - 1; k++) this.feed(c, this.slot(k));
			} else out.push({ frame, samples: EMPTY });
		}

		const c = this.capture;
		if (c) {
			for (let i = 0; i < block.length && c.filled < c.buf.length; i++)
				if (frame0 + i >= c.start) c.buf[c.filled++] = block[i];
			if (c.filled >= c.buf.length) out.push(this.finish());
		}
		return out;
	}

	private feed(c: { start: number; buf: Float32Array; filled: number }, s: number) {
		const f0 = this.rFrame[s];
		const o = s * this.rSize;
		for (let i = 0; i < this.rLen[s] && c.filled < c.buf.length; i++)
			if (f0 + i >= c.start) c.buf[c.filled++] = this.rData[o + i];
	}

	/** The first block of the recent ones that rose well above the quiet level; its attack sample. */
	attackFrame(quietest: number, lastPrev: number): number {
		const level = Number.isFinite(quietest) ? Math.max(quietest, this.floor / 4) * BLOCK : 0;
		let k = this.rCount - 1;
		for (let j = 0; j < this.rCount; j++) {
			const s = this.slot(j);
			if (this.rSum[s] > this.ratio * level && this.rFrame[s] > this.lastOnset) {
				k = j;
				break;
			}
		}
		const s = this.slot(k);
		const f0 = this.rFrame[s];
		const o = s * this.rSize;
		const n = this.rLen[s];
		const before = k > 0 ? this.slot(k - 1) : -1;
		const p0 = before >= 0 ? this.rData[before * this.rSize + this.rLen[before] - 1] : lastPrev;
		let p = p0;
		let peak = 0;
		for (let i = 0; i < n; i++) {
			const x = this.rData[o + i];
			peak = Math.max(peak, Math.abs(x - p), Math.abs(x));
			p = x;
		}
		p = p0;
		for (let i = 0; i < n; i++) {
			const x = this.rData[o + i];
			const d = Math.max(Math.abs(x - p), Math.abs(x));
			p = x;
			if (d >= 0.3 * peak) return f0 + i;
		}
		return f0;
	}

	finish(): OnsetEvent {
		const c = this.capture!;
		this.capture = null;
		return { frame: c.frame, samples: c.buf.subarray(0, c.filled) };
	}
}
