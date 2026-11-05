// A take's waveform: peaks per pixel column, drawn on a small canvas.

/** Per bucket, the min and max sample (bars are drawn from min to max). */
export type Peaks = { min: Float32Array; max: Float32Array };

/** Downsamples `samples` to `buckets` min/max pairs (empty buckets are 0). */
export function downsample(samples: Float32Array, buckets: number): Peaks {
	const n = Math.max(1, Math.floor(buckets));
	const min = new Float32Array(n);
	const max = new Float32Array(n);
	const len = samples.length;
	if (!len) return { min, max };
	for (let b = 0; b < n; b++) {
		const from = Math.floor((b * len) / n);
		const to = Math.max(from + 1, Math.floor(((b + 1) * len) / n));
		let lo = Infinity;
		let hi = -Infinity;
		for (let i = from; i < to && i < len; i++) {
			const v = samples[i];
			if (v < lo) lo = v;
			if (v > hi) hi = v;
		}
		min[b] = lo === Infinity ? 0 : lo;
		max[b] = hi === -Infinity ? 0 : hi;
	}
	return { min, max };
}

/** Mixes an AudioBuffer's channels to one (mono takes are returned as they are). */
export function mono(buffer: {
	numberOfChannels: number;
	length: number;
	getChannelData(c: number): Float32Array;
}): Float32Array {
	if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
	const out = new Float32Array(buffer.length);
	for (let c = 0; c < buffer.numberOfChannels; c++) {
		const d = buffer.getChannelData(c);
		for (let i = 0; i < out.length; i++) out[i] += d[i] / buffer.numberOfChannels;
	}
	return out;
}

/** Scale so a quiet take still shows its shape (at most 4x, never clipping). */
export function normaliser(p: Peaks): number {
	let peak = 0;
	for (let i = 0; i < p.min.length; i++) peak = Math.max(peak, -p.min[i], p.max[i]);
	return peak > 0 ? Math.min(4, 1 / peak) : 1;
}

export function drawPeaks(
	canvas: HTMLCanvasElement,
	p: Peaks,
	color: string,
	progress = -1,
	played = color
) {
	const ctx = canvas.getContext('2d');
	if (!ctx) return;
	const { width: w, height: h } = canvas;
	ctx.clearRect(0, 0, w, h);
	const n = p.min.length;
	const g = normaliser(p);
	const mid = h / 2;
	const col = w / n;
	for (let i = 0; i < n; i++) {
		const top = mid - Math.max(0.5, p.max[i] * g * mid);
		const bottom = mid - Math.min(-0.5, p.min[i] * g * mid);
		ctx.fillStyle = progress >= 0 && i / n <= progress ? played : color;
		ctx.fillRect(i * col, top, Math.max(1, col - 1), bottom - top);
	}
}

// ---- stored peaks (Take.peaks: 0..255 per 1/PEAK_RATE s) ---------------------------------------

/** 0..1 → 0..255 (stored compactly with the take). */
export const quantise = (level: number) => Math.max(0, Math.min(255, Math.round(level * 255)));

/**
 * Collects the level meter's readings into stored peaks while recording: `add` the loudest
 * sample of each read with its time in seconds; `peaks()` gives one value per 1/rate s.
 */
export class PeakCollector {
	private cols: number[] = [];
	constructor(private rate: number) {}
	add(seconds: number, level: number) {
		if (seconds < 0) return;
		const i = Math.floor(seconds * this.rate);
		// A gap (a slow frame): fill it with the level read now rather than leave silence.
		for (let k = this.cols.length; k < i; k++) this.cols[k] = quantise(level);
		this.cols[i] = Math.max(this.cols[i] ?? 0, quantise(level));
	}
	peaks(): number[] {
		return this.cols.slice();
	}
}

/** Stored peaks from decoded samples (the lazy path for takes without them). */
export function levelsOf(samples: Float32Array, sampleRate: number, rate: number): number[] {
	const per = Math.max(1, Math.round(sampleRate / rate));
	const out: number[] = [];
	for (let from = 0; from < samples.length; from += per) {
		let p = 0;
		const to = Math.min(samples.length, from + per);
		for (let i = from; i < to; i++) {
			const v = samples[i] < 0 ? -samples[i] : samples[i];
			if (v > p) p = v;
		}
		out.push(quantise(p));
	}
	return out;
}

/** Stored peaks drawn as `buckets` symmetric bars (each the loudest of its columns). */
export function peaksFromLevels(levels: ArrayLike<number>, buckets: number): Peaks {
	const n = Math.max(1, Math.floor(buckets));
	const min = new Float32Array(n);
	const max = new Float32Array(n);
	const len = levels.length;
	if (!len) return { min, max };
	for (let b = 0; b < n; b++) {
		const from = Math.floor((b * len) / n);
		const to = Math.max(from + 1, Math.floor(((b + 1) * len) / n));
		let p = 0;
		for (let i = from; i < to && i < len; i++) p = Math.max(p, levels[i]);
		max[b] = p / 255;
		min[b] = -p / 255;
	}
	return { min, max };
}
