// A click count-in (one bar, accented downbeat) on the shared AudioContext.
import { getAudioContext } from '$lib/audio/context';

/** Plays `beats` clicks at `bpm`; resolves when the next bar starts. `signal` cancels it. */
export function clickCountIn(bpm: number, beats: number, signal?: AbortSignal): Promise<boolean> {
	const ctx = getAudioContext();
	const beat = 60 / Math.max(20, Math.min(300, bpm));
	const t0 = ctx.currentTime + 0.08;
	const nodes: OscillatorNode[] = [];
	for (let i = 0; i < beats; i++) {
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.frequency.value = i === 0 ? 1500 : 1000;
		const t = t0 + i * beat;
		gain.gain.setValueAtTime(0.0001, t);
		gain.gain.exponentialRampToValueAtTime(0.6, t + 0.002);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
		osc.connect(gain).connect(ctx.destination);
		osc.start(t);
		osc.stop(t + 0.08);
		nodes.push(osc);
	}
	const ms = (t0 - ctx.currentTime + beats * beat) * 1000;
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve(true), ms);
		signal?.addEventListener('abort', () => {
			clearTimeout(timer);
			for (const n of nodes) {
				try {
					n.stop();
				} catch {
					// already stopped
				}
			}
			resolve(false);
		});
	});
}

/** The beat of the count-in shown on screen (1-based), from its start time. */
export const countBeat = (elapsedMs: number, bpm: number) =>
	Math.floor(elapsedMs / (60_000 / bpm)) + 1;
