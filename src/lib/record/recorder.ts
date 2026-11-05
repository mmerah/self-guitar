// One take at a time: the raw mic (no echo cancellation, noise suppression or auto gain) into a
// MediaRecorder whose chunks go to IndexedDB every few seconds, plus a level for the meter.
// Leaving the page (tab hidden, app backgrounded: iOS stops MediaRecorder there anyway) ends
// the take and saves it.
import { getAudioContext } from '$lib/audio/context';
import {
	acquireMic,
	classifyMicError,
	micPrecheck,
	releaseMic,
	type MicProblem
} from '$lib/tuner/mic';
import { browserMime, canRecord } from './mime';
import { checkQuota, isQuotaError, NO_ROOM, persistStorage, STORAGE_FULL } from './quota';
import { appendChunk, createTake, deleteTake, finishTake, markLive } from './store';
import { PEAK_RATE, type Take, type TakeInput } from './types';
import { PeakCollector } from './waveform';

/** The recorder's name with the shared mic (src/lib/tuner/mic.ts). */
export const MIC_OWNER = 'record';
/** Seconds of audio per chunk written to IndexedDB. */
export const CHUNK_SECONDS = 2;
/** Below this level (0..1 peak) the input counts as silence (raw mic room noise is ~0.005). */
export const SILENCE_LEVEL = 0.025;
/** How often the level is sampled for the stored waveform and the silence timer (ms). */
const SAMPLE_MS = 1000 / PEAK_RATE / 2;

/** 'no-room': full before the take started (nothing recorded); 'storage-full': filled up during it. */
export type RecorderProblem = MicProblem | 'no-recorder' | 'no-room' | 'storage-full' | 'failed';

export const RECORDER_HELP: Record<
	Exclude<RecorderProblem, MicProblem>,
	{ title: string; body: string }
> = {
	'no-recorder': {
		title: 'Recording is not supported here',
		body: 'This browser cannot record audio. Try a current Safari (iOS 14.3+), Chrome or Firefox.'
	},
	'no-room': NO_ROOM,
	'storage-full': { title: 'Storage is full', body: STORAGE_FULL },
	failed: {
		title: 'Recording stopped',
		body: 'The browser stopped the recording. What was recorded so far is saved.'
	}
};

/** Headphones (or a headset) look connected: their names show once the mic is allowed. */
export async function headphonesLikely(): Promise<boolean | null> {
	try {
		const devices = await navigator.mediaDevices.enumerateDevices();
		const labelled = devices.filter((d) => d.label);
		if (!labelled.length) return null;
		return labelled.some(
			(d) =>
				(d.kind === 'audiooutput' || d.kind === 'audioinput') &&
				/head(phone|set)|airpods|buds|earphone|bluetooth|bt |hands-free|wired/i.test(d.label)
		);
	} catch {
		return null;
	}
}

export class TakeRecorder {
	private stream: MediaStream | null = null;
	private source: MediaStreamAudioSourceNode | null = null;
	private analyser: AnalyserNode | null = null;
	private buf: Float32Array<ArrayBuffer> | null = null;
	private mr: MediaRecorder | null = null;
	private take: Take | null = null;
	private writes: Promise<void> = Promise.resolve();
	private t0 = 0;
	private stopping: Promise<Take | null> | null = null;
	private peak = 0;
	private peaks: PeakCollector | null = null;
	private sampler: ReturnType<typeof setInterval> | undefined;
	private lastSound = 0;
	/** MediaRecorder sessions started (one per take: see start()). */
	sessions = 0;
	/** Set when a write failed (storage full): the take ends there. */
	problem: RecorderProblem | null = null;
	/** The take ended by itself (page hidden, storage full, the mic went away). */
	onended?: (take: Take | null, problem: RecorderProblem | null) => void;

	get recording() {
		return !!this.mr && !this.stopping;
	}
	get id() {
		return this.take?.id ?? null;
	}
	/** Seconds since the recorder started. */
	elapsed() {
		return this.t0 ? (performance.now() - this.t0) / 1000 : 0;
	}
	/** performance.now() when the recorder started. */
	get startedAt() {
		return this.t0;
	}
	/** Loudest sample in the analyser's window now (0..1), for the meter. */
	level(): number {
		if (!this.analyser || !this.buf) return 0;
		this.analyser.getFloatTimeDomainData(this.buf);
		let p = 0;
		for (let i = 0; i < this.buf.length; i++) p = Math.max(p, Math.abs(this.buf[i]));
		this.peak = Math.max(this.peak, p);
		return p;
	}
	/** Seconds since the input was last above SILENCE_LEVEL (or since the take started). */
	quietFor(): number {
		return this.lastSound ? (performance.now() - this.lastSound) / 1000 : 0;
	}
	/** The waveform so far (stored with the take when it stops). */
	peaksSoFar(): number[] {
		return this.peaks?.peaks() ?? [];
	}
	private sample = () => {
		if (!this.t0) return;
		const p = this.level();
		this.peaks?.add(this.elapsed(), p);
		if (p >= SILENCE_LEVEL) this.lastSound = performance.now();
	};
	/** Nothing at all arrived (iOS's silent-mic glitch, a muted input). */
	get silent() {
		return this.peak === 0;
	}

	/** Opens the mic; call from the tap (iOS). Resolves with a problem to explain, or null. */
	async open(): Promise<RecorderProblem | null> {
		if (this.stream) return null;
		const pre = micPrecheck();
		if (pre) return pre;
		if (!canRecord()) return 'no-recorder';
		// Full already: say so now, not after a count-in (and never "saved up to this point").
		if ((await checkQuota())?.level === 'full') return 'no-room';
		// The shared mic (owner 'record'): with Mic listening on, recording takes the same stream
		// and the same iOS 'play-and-record' session instead of opening a second capture.
		let mic: MediaStream;
		try {
			mic = await acquireMic(MIC_OWNER);
		} catch (e) {
			return classifyMicError(e);
		}
		// After the mic: on iOS the session switch may rebuild the shared context at the mic's rate.
		const ctx = getAudioContext();
		this.stream = mic;
		this.source = ctx.createMediaStreamSource(mic);
		this.analyser = ctx.createAnalyser();
		// ~43 ms at 48 kHz: the 25 ms sampler below sees every sample at least once.
		this.analyser.fftSize = 2048;
		this.buf = new Float32Array(this.analyser.fftSize);
		this.source.connect(this.analyser);
		await ctx.resume().catch(() => {});
		return null;
	}

	/** Starts writing a take (the mic must be open). Resolves once audio is being captured. */
	async start(input: Omit<TakeInput, 'mime'>): Promise<RecorderProblem | null> {
		if (!this.stream) return 'failed';
		const quota = await checkQuota();
		if (quota?.level === 'full') return 'no-room';
		void persistStorage();
		const mime = browserMime();
		let mr: MediaRecorder;
		try {
			mr = new MediaRecorder(this.stream, {
				...(mime && { mimeType: mime }),
				audioBitsPerSecond: 128_000
			});
		} catch {
			try {
				mr = new MediaRecorder(this.stream);
			} catch {
				return 'no-recorder';
			}
		}
		try {
			this.take = await createTake({ ...input, mime: mr.mimeType || mime || 'audio/webm' });
		} catch (e) {
			return isQuotaError(e) ? 'no-room' : 'failed';
		}
		markLive(this.take.id, true);
		// One MediaRecorder session per take, never stopped and restarted mid-take (no requestData
		// either): its timeslices are the pieces of ONE file. Safari (iOS 14.3+, macOS) writes
		// fragmented MP4: the first chunk carries ftyp+moov, every later one moof+mdat, so the
		// chunks joined in order play as one .m4a, as do the WebM clusters of Chrome and Firefox.
		// Two sessions would give two init segments in one blob, which Safari will not decode
		// past the first. iOS also ends a session when the page is hidden or the app backgrounded:
		// that ends the take (onHide), and a new take is a new session. The chunk handler is bound
		// to this session's take id, so a late chunk from an earlier session never joins this one.
		const id = this.take.id;
		this.mr = mr;
		this.sessions++;
		this.problem = null;
		this.peak = 0;
		this.peaks = new PeakCollector(PEAK_RATE);
		this.writes = Promise.resolve();
		mr.ondataavailable = (e) => {
			if (!e.data.size || this.mr !== mr) return;
			const duration = this.elapsed();
			this.writes = this.writes.then(async () => {
				if (this.problem === 'storage-full') return;
				try {
					await appendChunk(id, await e.data.arrayBuffer(), duration);
				} catch (err) {
					this.problem = isQuotaError(err) ? 'storage-full' : 'failed';
					if (this.mr && !this.stopping) void this.end();
				}
			});
		};
		mr.onerror = () => {
			if (this.mr !== mr) return;
			this.problem = 'failed';
			void this.end();
		};
		this.stream.getAudioTracks()[0]?.addEventListener('ended', this.onTrackEnded);
		document.addEventListener('visibilitychange', this.onHide);
		window.addEventListener('pagehide', this.onHide);
		await new Promise<void>((resolve) => {
			mr.onstart = () => resolve();
			mr.start(CHUNK_SECONDS * 1000);
			setTimeout(resolve, 500); // some browsers fire no start event
		});
		this.t0 = performance.now();
		this.lastSound = this.t0;
		clearInterval(this.sampler);
		this.sampler = setInterval(this.sample, SAMPLE_MS);
		return null;
	}

	private onTrackEnded = () => {
		this.problem ??= 'failed';
		void this.end();
	};
	private onHide = (e: Event) => {
		if (e.type === 'pagehide' || document.visibilityState === 'hidden') void this.end();
	};

	private async end() {
		if (!this.mr || this.stopping) return this.stopping;
		const take = this.stop();
		const t = await take;
		this.onended?.(t, this.problem);
		return t;
	}

	/** Ends the take and saves its last chunk; resolves with it (null when it had no audio). */
	stop(): Promise<Take | null> {
		if (this.stopping) return this.stopping;
		const mr = this.mr;
		const take = this.take;
		if (!mr || !take) return Promise.resolve(null);
		const duration = this.elapsed();
		clearInterval(this.sampler);
		const peaks = this.peaksSoFar();
		document.removeEventListener('visibilitychange', this.onHide);
		window.removeEventListener('pagehide', this.onHide);
		this.stopping = (async () => {
			if (mr.state !== 'inactive') {
				await new Promise<void>((resolve) => {
					mr.addEventListener('stop', () => resolve(), { once: true });
					try {
						mr.stop();
					} catch {
						resolve();
					}
					setTimeout(resolve, 1500);
				});
			}
			await this.writes;
			markLive(take.id, false);
			const done = await finishTake(take.id, duration, peaks).catch(() => null);
			this.mr = null;
			this.peaks = null;
			this.lastSound = 0;
			this.take = null;
			this.t0 = 0;
			this.stopping = null;
			return done;
		})();
		return this.stopping;
	}

	/** Stops without keeping anything (the count-in was cancelled). */
	async discard() {
		const id = this.take?.id;
		await this.stop();
		if (id) await deleteTake(id).catch(() => {});
	}

	/**
	 * Gives the mic back. The tracks stop, and iOS returns to plain playback (louder speaker, the
	 * silent switch honoured as a media app), only when no other owner (Mic listening) holds it.
	 */
	close() {
		const had = !!this.stream;
		this.stream?.getAudioTracks()[0]?.removeEventListener('ended', this.onTrackEnded);
		this.source?.disconnect();
		this.stream = null;
		this.source = this.analyser = null;
		this.buf = null;
		if (had) releaseMic(MIC_OWNER);
	}
}
