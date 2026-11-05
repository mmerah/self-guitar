// Experimental chord check: the chroma (energy per pitch class) of a strum, compared with the
// pitch classes the tab's chord should sound. Pure and unit-tested.

/** In-place radix-2 FFT (re/im of length 2^k). */
export function fft(re: Float64Array, im: Float64Array) {
	const n = re.length;
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			[re[i], re[j]] = [re[j], re[i]];
			[im[i], im[j]] = [im[j], im[i]];
		}
	}
	for (let len = 2; len <= n; len <<= 1) {
		const ang = (-2 * Math.PI) / len;
		const wr = Math.cos(ang);
		const wi = Math.sin(ang);
		for (let i = 0; i < n; i += len) {
			let cr = 1;
			let ci = 0;
			for (let k = 0; k < len / 2; k++) {
				const a = i + k;
				const b = a + len / 2;
				const tr = re[b] * cr - im[b] * ci;
				const ti = re[b] * ci + im[b] * cr;
				re[b] = re[a] - tr;
				im[b] = im[a] - ti;
				re[a] += tr;
				im[a] += ti;
				const nr = cr * wr - ci * wi;
				ci = cr * wi + ci * wr;
				cr = nr;
			}
		}
	}
}

/** 12-bin chroma (C = 0), normalised to sum 1, from 70 Hz to 1.5 kHz (Hann window). */
export function chromaOf(samples: Float32Array, sampleRate: number): number[] {
	let n = 1;
	while (n * 2 <= samples.length && n < 16384) n *= 2;
	const re = new Float64Array(n);
	const im = new Float64Array(n);
	for (let i = 0; i < n; i++) re[i] = samples[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
	fft(re, im);
	const chroma = new Array<number>(12).fill(0);
	for (let k = 1; k < n / 2; k++) {
		const f = (k * sampleRate) / n;
		if (f < 70 || f > 1500) continue;
		const midi = 69 + 12 * Math.log2(f / 440);
		const pc = ((Math.round(midi) % 12) + 12) % 12;
		// Magnitude (not power): quieter chord tones still count.
		chroma[pc] += Math.hypot(re[k], im[k]);
	}
	const sum = chroma.reduce((a, b) => a + b, 0);
	return sum > 0 ? chroma.map((v) => v / sum) : chroma;
}

/** Cosine similarity of a chroma with a chord's pitch-class template. */
export function chordSimilarity(chroma: readonly number[], pcs: readonly number[]): number {
	const t = new Array<number>(12).fill(0);
	for (const p of pcs) t[((p % 12) + 12) % 12] = 1;
	let dot = 0;
	let nc = 0;
	let nt = 0;
	for (let i = 0; i < 12; i++) {
		dot += chroma[i] * t[i];
		nc += chroma[i] * chroma[i];
		nt += t[i];
	}
	return nc && nt ? dot / Math.sqrt(nc * nt) : 0;
}

/** Major and minor triads on every root: the competition for "is it the expected chord?". */
const TRIADS: number[][] = Array.from({ length: 24 }, (_, i) => {
	const root = i % 12;
	return [root, (root + (i < 12 ? 4 : 3)) % 12, (root + 7) % 12];
});

/**
 * The strum matches when the expected chord's template fits at least `min` and no other triad
 * fits clearly better (a wrong chord sharing two notes usually loses by a margin).
 */
export function chordMatches(
	chroma: readonly number[],
	pcs: readonly number[],
	min = 0.6
): boolean {
	const own = chordSimilarity(chroma, pcs);
	if (own < min) return false;
	const best = Math.max(
		...TRIADS.filter((t) => !t.every((p) => pcs.includes(p))).map((t) => chordSimilarity(chroma, t))
	);
	return own >= best - 0.05;
}
