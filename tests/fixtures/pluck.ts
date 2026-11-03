// Synthetic plucked strings for tuner tests. `decayingFundamental` reproduces the octave trap of
// a real low string: the fundamental dies within ~0.5 s while the 2nd harmonic rings on, so a
// pitch detector reads the octave above for most of the note.

export const SAMPLE_RATE = 48000;

/** Sum of decaying, slightly inharmonic partials (amplitude and decay per second, 1st first). */
export function pluckSamples(
	freq: number,
	partials: readonly { amp: number; decay: number }[],
	seconds = 3,
	sampleRate = SAMPLE_RATE
): Float32Array {
	const out = new Float32Array(Math.round(seconds * sampleRate));
	let peak = 0;
	for (let i = 0; i < out.length; i++) {
		const t = i / sampleRate;
		let v = 0;
		partials.forEach(({ amp, decay }, k) => {
			const h = k + 1;
			v +=
				amp *
				Math.exp(-t * decay) *
				Math.sin(2 * Math.PI * h * freq * Math.sqrt(1 + 1e-4 * h * h) * t + h);
		});
		out[i] = v;
		peak = Math.max(peak, Math.abs(v));
	}
	for (let i = 0; i < out.length; i++) out[i] *= 0.8 / peak;
	return out;
}

/** The verifier's "fast fundamental" pluck: E2 reads as E3 from ~0.5 s on without a guard. */
export const decayingFundamental = (freq: number) =>
	pluckSamples(freq, [
		{ amp: 0.6, decay: 6 },
		{ amp: 1, decay: 1.2 },
		{ amp: 0.5, decay: 3 },
		{ amp: 0.3, decay: 3 }
	]);

export const sine = (freq: number, seconds = 4, sampleRate = SAMPLE_RATE) =>
	Float32Array.from(
		{ length: Math.round(seconds * sampleRate) },
		(_, i) => 0.5 * Math.sin((2 * Math.PI * freq * i) / sampleRate)
	);
