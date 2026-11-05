// Hands-free stop settings (per device): a take over a looping backing ends after N passes, a
// solo take after some seconds of silence. 0 turns either off.

export const PASS_CHOICES = [1, 2, 3, 5, 0] as const;
export const SILENCE_CHOICES = [5, 8, 15, 0] as const;
export const DEFAULT_PASSES = 2;
export const DEFAULT_SILENCE_S = 8;

const PASSES_KEY = 'sg:rec.passes';
const SILENCE_KEY = 'sg:rec.silence';

function read(key: string, allowed: readonly number[], fallback: number): number {
	try {
		const v = localStorage.getItem(key);
		const n = v === null ? NaN : Number(v);
		return allowed.includes(n) ? n : fallback;
	} catch {
		return fallback;
	}
}
function write(key: string, v: number) {
	try {
		localStorage.setItem(key, String(v));
	} catch {
		// a per-device convenience only
	}
}

export const readPasses = () => read(PASSES_KEY, PASS_CHOICES, DEFAULT_PASSES);
export const writePasses = (n: number) => write(PASSES_KEY, n);
export const readSilence = () => read(SILENCE_KEY, SILENCE_CHOICES, DEFAULT_SILENCE_S);
export const writeSilence = (s: number) => write(SILENCE_KEY, s);

/** What ends an along take: the backing's end, or N passes of a loop (0: only Stop). */
export function alongStop(looping: boolean, passes: number): string {
	if (!looping) return 'Stops at the end of the tab';
	return passes
		? `Stops after ${passes} pass${passes === 1 ? '' : 'es'}`
		: 'Stop when you are done';
}

/** What ends a solo take. */
export function soloStop(silenceS: number): string {
	return silenceS ? `Stops after ${silenceS} s of silence` : 'Stop when you are done';
}
