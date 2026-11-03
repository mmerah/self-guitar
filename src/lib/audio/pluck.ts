// Tiny plucked-string synth (Karplus-Strong) for chord playback and tuner reference tones.
// Each note is rendered once into an AudioBuffer (cached), then played with a buffer source.

const cache = new Map<string, AudioBuffer>();

/**
 * Renders a plucked string. The delay line is fractional (linear interpolation) and compensates
 * the averaging filter's half-sample delay, so the pitch is accurate enough for tuning by ear.
 */
export function renderPluck(
	sampleRate: number,
	freq: number,
	seconds: number,
	halfLife: number
): Float32Array {
	const out = new Float32Array(Math.round(sampleRate * seconds));
	const delay = sampleRate / freq - 0.5;
	const n0 = Math.ceil(delay) + 1;
	// Excitation: one period of softened noise (a one-pole low-pass rounds off the pick attack).
	let lp = 0;
	let mean = 0;
	for (let i = 0; i < n0 && i < out.length; i++) {
		lp += 0.5 * (Math.random() * 2 - 1 - lp);
		out[i] = lp;
		mean += lp / n0;
	}
	// No DC: the loop filter would keep it, and it blurs the pitch for a detector (and the ear).
	for (let i = 0; i < n0 && i < out.length; i++) out[i] -= mean;
	// Loss per period so the amplitude halves every `halfLife` seconds.
	const decay = 0.5 ** (1 / (freq * halfLife));
	for (let n = n0; n < out.length; n++) {
		const pos = n - delay;
		const i = Math.floor(pos);
		const frac = pos - i;
		const a = out[i] + frac * (out[i + 1] - out[i]); // delay > 1.5 keeps i + 1 < n
		const b = out[i - 1] + frac * (out[i] - out[i - 1]);
		out[n] = decay * 0.5 * (a + b);
	}
	return out;
}

function pluckBuffer(ctx: BaseAudioContext, freq: number, seconds: number, halfLife: number) {
	const key = `${ctx.sampleRate}:${freq.toFixed(3)}:${seconds}:${halfLife}`;
	let buf = cache.get(key);
	if (!buf) {
		buf = ctx.createBuffer(1, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
		buf.copyToChannel(
			renderPluck(ctx.sampleRate, freq, seconds, halfLife) as Float32Array<ArrayBuffer>,
			0
		);
		cache.set(key, buf);
	}
	return buf;
}

export type PluckOptions = { when?: number; gain?: number; seconds?: number; halfLife?: number };

/** Plays one plucked note; returns a function that fades it out. */
export function pluck(ctx: AudioContext, freq: number, opts: PluckOptions = {}): () => void {
	const { when = ctx.currentTime, gain = 0.5, seconds = 2.5, halfLife = 0.7 } = opts;
	const src = ctx.createBufferSource();
	src.buffer = pluckBuffer(ctx, freq, seconds, halfLife);
	const g = ctx.createGain();
	g.gain.value = gain;
	src.connect(g).connect(ctx.destination);
	src.start(when);
	return () => {
		const t = ctx.currentTime;
		g.gain.setTargetAtTime(0, t, 0.03);
		src.stop(t + 0.2);
	};
}

/**
 * Strums several notes in the given order (low to high for a down-strum), `spread` seconds apart,
 * starting at `when` (default: now).
 */
export function strum(
	ctx: AudioContext,
	freqs: readonly number[],
	spread = 0.035,
	opts: { when?: number; level?: number; seconds?: number } = {}
) {
	const { when = ctx.currentTime + 0.02, level = 1, seconds = 3 } = opts;
	const gain = (0.6 * level) / Math.sqrt(Math.max(1, freqs.length));
	return freqs.map((f, i) => pluck(ctx, f, { when: when + i * spread, gain, seconds }));
}
