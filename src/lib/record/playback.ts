// Playing a take back on the shared AudioContext (a gain node works on iOS, where an <audio>
// element's volume is fixed). A take is decoded only to play it, and only one decoded take is
// kept (a decoded minute of stereo is ~20 MB): the waveform comes from the peaks stored with the
// take, and a take without them gets them once from a low-rate decode (see ensurePeaks).
import { getAudioContext } from '$lib/audio/context';
import { claimPlayback, releasePlayback } from '$lib/audio/exclusive';
import { getTake, takeBlob, updateTake } from './store';
import { PEAK_RATE, type Take } from './types';
import { levelsOf, mono } from './waveform';

let cached: { id: string; buffer: Promise<AudioBuffer | null> } | null = null;

/** The take decoded for playback (the last one only is kept; null when it cannot be decoded). */
export function decodeTake(id: string): Promise<AudioBuffer | null> {
	if (cached?.id === id) return cached.buffer;
	const buffer = (async () => {
		const blob = await takeBlob(id);
		if (!blob || !blob.size) return null;
		const ctx = getAudioContext();
		try {
			return await ctx.decodeAudioData(await blob.arrayBuffer());
		} catch {
			return null;
		}
	})();
	cached = { id, buffer };
	return buffer;
}

export const forgetTake = (id: string) => {
	if (cached?.id === id) cached = null;
};

/** Sample rate of the waveform-only decode: small (a minute is ~2 MB of floats), still shaped. */
const PEAKS_DECODE_RATE = 8000;
const computing = new Map<string, Promise<number[] | null>>();

/**
 * The take's stored peaks, computing and storing them first when it has none (one mono decode
 * at 8 kHz, dropped once measured). Null when the browser cannot decode the take.
 */
export function ensurePeaks(take: Pick<Take, 'id' | 'peaks'>): Promise<number[] | null> {
	if (take.peaks?.length) return Promise.resolve(take.peaks);
	let p = computing.get(take.id);
	if (!p) {
		p = (async () => {
			const stored = (await getTake(take.id).catch(() => null))?.peaks;
			if (stored?.length) return stored;
			const blob = await takeBlob(take.id);
			if (!blob || !blob.size) return null;
			const Offline =
				globalThis.OfflineAudioContext ??
				(globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
					.webkitOfflineAudioContext;
			if (!Offline) return null;
			let levels: number[];
			try {
				const ctx = new Offline(1, 1, PEAKS_DECODE_RATE);
				const b = await ctx.decodeAudioData(await blob.arrayBuffer());
				levels = levelsOf(mono(b), b.sampleRate, PEAK_RATE);
			} catch {
				return null;
			}
			await updateTake(take.id, { peaks: levels }).catch(() => {});
			return levels;
		})().finally(() => computing.delete(take.id));
		computing.set(take.id, p);
	}
	return p;
}

/** One take playing at a time (a new play stops the old one, and any other player on the page). */
export class TakePlayer {
	private src: AudioBufferSourceNode | null = null;
	private gain: GainNode | null = null;
	private startedAt = 0;
	private from = 0;
	private buffer: AudioBuffer | null = null;
	private volume = 1;
	onend?: () => void;

	get playing() {
		return !!this.src;
	}
	get duration() {
		return this.buffer?.duration ?? 0;
	}
	/** Seconds into the take. */
	position(): number {
		if (!this.src || !this.gain) return this.from;
		return this.from + (this.gain.context.currentTime - this.startedAt);
	}

	private stopForOther = () => this.stop();

	/** Plays `buffer` from `from` seconds (call from a tap: iOS). */
	play(buffer: AudioBuffer, from = 0, exclusive = true) {
		this.stop(false);
		const ctx = getAudioContext();
		this.buffer = buffer;
		this.gain = ctx.createGain();
		this.gain.gain.value = this.volume;
		this.gain.connect(ctx.destination);
		const src = ctx.createBufferSource();
		src.buffer = buffer;
		src.connect(this.gain);
		this.from = Math.max(0, Math.min(from, buffer.duration));
		this.startedAt = ctx.currentTime;
		src.onended = () => {
			if (this.src !== src) return;
			this.src = null;
			this.from = 0;
			releasePlayback(this.stopForOther);
			this.onend?.();
		};
		src.start(0, this.from);
		this.src = src;
		if (exclusive) claimPlayback(this.stopForOther);
	}

	setVolume(v: number) {
		this.volume = v;
		if (this.gain) this.gain.gain.value = v;
	}

	stop(notify = true) {
		const src = this.src;
		this.src = null;
		this.from = 0;
		if (src) {
			try {
				src.stop();
			} catch {
				// not started
			}
			src.disconnect();
		}
		this.gain?.disconnect();
		this.gain = null;
		releasePlayback(this.stopForOther);
		if (src && notify) this.onend?.();
	}
}
