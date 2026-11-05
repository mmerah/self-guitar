// M7 record fixes: stored waveform peaks, one MediaRecorder session per take (its chunks join in
// order under the take's mime), the "not enough storage" message, and the shared mic.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The recorder's AudioContext: just enough for a source → analyser (the analyser reads `level`).
const audio = vi.hoisted(() => ({ level: 0.5 }));
vi.mock('$lib/audio/context', () => ({
	getAudioContext: () => ({
		createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
		createAnalyser: () => ({
			fftSize: 2048,
			getFloatTimeDomainData(buf: Float32Array) {
				buf.fill(0);
				buf[0] = audio.level;
			}
		}),
		resume: () => Promise.resolve()
	})
}));

import { NO_ROOM, STORAGE_FULL } from '../../src/lib/record/quota';
import { MIC_OWNER, RECORDER_HELP, TakeRecorder } from '../../src/lib/record/recorder';
import {
	alongStop,
	DEFAULT_PASSES,
	DEFAULT_SILENCE_S,
	readPasses,
	readSilence,
	soloStop
} from '../../src/lib/record/prefs';
import {
	appendChunk,
	closeDb,
	createTake,
	finishTake,
	getTake,
	takeBlob,
	updateTake
} from '../../src/lib/record/store';
import { PEAK_RATE, type TakeInput } from '../../src/lib/record/types';
import { levelsOf, PeakCollector, peaksFromLevels, quantise } from '../../src/lib/record/waveform';
import { acquireMic, micOwners, releaseMic } from '../../src/lib/tuner/mic';

const input = (over: Partial<TakeInput> = {}): TakeInput => ({
	itemType: 'song',
	itemId: 'aura-lee',
	title: 'Aura Lee',
	tempoPct: 100,
	bpm: 90,
	mime: 'audio/mp4',
	mode: 'solo',
	offsetMs: 0,
	countIn: false,
	...over
});

// ---- a fake browser: mic tracks, MediaRecorder, storage estimate, document/window events -------

class FakeTrack extends EventTarget {
	readyState: 'live' | 'ended' = 'live';
	stop() {
		this.readyState = 'ended';
	}
	getSettings() {
		return { sampleRate: 48000 };
	}
}
class FakeStream {
	tracks = [new FakeTrack()];
	getAudioTracks() {
		return this.tracks;
	}
	getTracks() {
		return this.tracks;
	}
}

/** Every MediaRecorder made; a test drives its chunks with emit(). */
const recorders: FakeRecorder[] = [];
class FakeRecorder {
	static isTypeSupported = (t: string) => t.startsWith('audio/mp4');
	state: 'inactive' | 'recording' = 'inactive';
	mimeType: string;
	ondataavailable: ((e: { data: Blob }) => void) | null = null;
	onerror: (() => void) | null = null;
	onstart: (() => void) | null = null;
	private stopListeners: (() => void)[] = [];
	timeslice = 0;
	constructor(
		public stream: FakeStream,
		opts?: { mimeType?: string }
	) {
		this.mimeType = opts?.mimeType ?? 'audio/mp4';
		recorders.push(this);
	}
	start(timeslice: number) {
		this.timeslice = timeslice;
		this.state = 'recording';
		this.onstart?.();
	}
	emit(...bytes: number[]) {
		this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)], { type: this.mimeType }) });
	}
	addEventListener(type: string, fn: () => void) {
		if (type === 'stop') this.stopListeners.push(fn);
	}
	/** Safari: the last timeslice, then "stop". */
	stop() {
		this.state = 'inactive';
		this.emit(0xff);
		for (const fn of this.stopListeners) fn();
	}
	requestData() {
		throw new Error('the recorder must never ask for data mid-take');
	}
}

let gum = 0;
let estimate = { usage: 0, quota: 1e9 };

beforeEach(async () => {
	await closeDb();
	globalThis.indexedDB = new IDBFactory();
	recorders.length = 0;
	gum = 0;
	estimate = { usage: 0, quota: 1e9 };
	audio.level = 0.5;
	const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
	vi.stubGlobal('document', doc);
	vi.stubGlobal(
		'window',
		Object.assign(new EventTarget(), { isSecureContext: true, MediaRecorder: FakeRecorder })
	);
	vi.stubGlobal('MediaRecorder', FakeRecorder);
	vi.stubGlobal('navigator', {
		mediaDevices: {
			getUserMedia: async () => {
				gum++;
				return new FakeStream();
			}
		},
		storage: { estimate: async () => estimate }
	});
});
afterEach(async () => {
	for (const o of micOwners()) releaseMic(o);
	vi.unstubAllGlobals();
	await closeDb();
});

const bytesOf = async (b: Blob | null) => [...new Uint8Array(await b!.arrayBuffer())];

describe('stored waveform peaks', () => {
	it('collects one quantised peak per 1/rate s, filling gaps', () => {
		const c = new PeakCollector(20);
		c.add(0, 0.1);
		c.add(0.02, 0.5);
		c.add(0.2, 1);
		const p = c.peaks();
		expect(p).toHaveLength(5);
		expect(p[0]).toBe(quantise(0.5));
		expect(p[4]).toBe(255);
		expect(p[1]).toBe(255); // a gap is filled with the next reading, not left silent
	});

	it('measures decoded samples and draws stored levels as symmetric bars', () => {
		const s = new Float32Array(8000);
		s[100] = -0.5;
		s[7999] = 1;
		const levels = levelsOf(s, 8000, PEAK_RATE);
		expect(levels).toHaveLength(PEAK_RATE);
		expect(levels[0]).toBe(quantise(0.5));
		expect(levels[PEAK_RATE - 1]).toBe(255);
		const p = peaksFromLevels([0, 255, 51, 0], 2);
		expect(p.max[0]).toBe(1);
		expect(p.max[1]).toBeCloseTo(0.2, 5);
		expect(p.min[0]).toBe(-1);
		expect(p.min[1]).toBeCloseTo(-0.2, 5);
	});

	it('are stored with the take when it finishes (and can be added later)', async () => {
		const t = await createTake(input());
		await appendChunk(t.id, new Uint8Array([1]).buffer, 1);
		const done = await finishTake(t.id, 1, [10, 200, 30]);
		expect(done?.peaks).toEqual([10, 200, 30]);
		expect((await getTake(t.id))?.peaks).toEqual([10, 200, 30]);
		await updateTake(t.id, { peaks: [1, 2] });
		expect((await getTake(t.id))?.peaks).toEqual([1, 2]);
	});
});

describe('one MediaRecorder session per take (Safari fragmented MP4)', () => {
	it('joins the chunks of one take in order, under its mime', async () => {
		const t = await createTake(input({ mime: 'audio/mp4;codecs=mp4a.40.2' }));
		// 12 chunks: the order is numeric (chunk 10 after 9, not after 1).
		for (let i = 0; i < 12; i++) await appendChunk(t.id, new Uint8Array([i]).buffer, i);
		await finishTake(t.id, 12);
		const blob = await takeBlob(t.id);
		expect(blob?.type).toBe('audio/mp4;codecs=mp4a.40.2');
		expect(await bytesOf(blob)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
	});

	it('records each take with exactly one session, never mixing a late chunk into the next', async () => {
		const rec = new TakeRecorder();
		expect(await rec.open()).toBeNull();
		expect(await rec.start(input())).toBeNull();
		const first = recorders[0];
		expect(first.timeslice).toBeGreaterThan(0);
		first.emit(1, 2); // ftyp+moov…
		first.emit(3); // moof+mdat
		await new Promise((r) => setTimeout(r, 80));
		const a = await rec.stop();
		expect(rec.sessions).toBe(1);
		expect(recorders).toHaveLength(1);
		expect(a?.mime).toBe('audio/mp4;codecs=mp4a.40.2');
		expect(a?.peaks?.length).toBeGreaterThan(0);
		expect(await bytesOf(await takeBlob(a!.id))).toEqual([1, 2, 3, 0xff]);

		expect(await rec.start(input())).toBeNull();
		expect(recorders).toHaveLength(2);
		expect(rec.sessions).toBe(2);
		first.emit(9, 9); // a straggler from the first session
		recorders[1].emit(4);
		const b = await rec.stop();
		expect(await bytesOf(await takeBlob(b!.id))).toEqual([4, 0xff]);
		expect(await bytesOf(await takeBlob(a!.id))).toEqual([1, 2, 3, 0xff]);
		rec.close();
	});

	it('times the silence for the hands-free stop', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
		try {
			vi.advanceTimersByTime(1000); // (the fake clock starts at 0, which reads as "not started")
			const rec = new TakeRecorder();
			await rec.open();
			await rec.start(input());
			vi.advanceTimersByTime(1000);
			expect(rec.quietFor()).toBeLessThan(0.2);
			audio.level = 0.001;
			vi.advanceTimersByTime(3000);
			expect(rec.quietFor()).toBeGreaterThanOrEqual(2.9);
			audio.level = 0.4;
			vi.advanceTimersByTime(100);
			expect(rec.quietFor()).toBeLessThan(0.2);
			vi.useRealTimers();
			await rec.stop();
			rec.close();
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('storage', () => {
	it('says "not enough storage to record" when full before the take, and records nothing', async () => {
		estimate = { usage: 1e9 - 1024, quota: 1e9 };
		const rec = new TakeRecorder();
		// Before the mic is even asked for (a solo take would otherwise learn it after the count-in).
		expect(await rec.open()).toBe('no-room');
		expect(gum).toBe(0);
		// And at the start of the take, should it fill up in between.
		estimate = { usage: 0, quota: 1e9 };
		expect(await rec.open()).toBeNull();
		estimate = { usage: 1e9 - 1024, quota: 1e9 };
		expect(await rec.start(input())).toBe('no-room');
		expect(recorders).toHaveLength(0);
		expect(RECORDER_HELP['no-room'].title).toBe('Not enough storage to record — free some space');
		expect(NO_ROOM.title).not.toMatch(/saved/);
		// "Saved up to this point" is only for a take that filled the disk while recording.
		expect(RECORDER_HELP['storage-full'].body).toBe(STORAGE_FULL);
		rec.close();
	});
});

describe('the shared mic', () => {
	it('records on the same stream as Mic listening: one capture, one live track', async () => {
		const listen = await acquireMic('listen');
		const rec = new TakeRecorder();
		expect(await rec.open()).toBeNull();
		expect(micOwners().sort()).toEqual(['listen', MIC_OWNER].sort());
		expect(gum).toBe(1);
		expect(recorders).toHaveLength(0);
		await rec.start(input());
		expect(recorders[0].stream).toBe(listen);
		const live = (listen as unknown as FakeStream).tracks.filter((t) => t.readyState === 'live');
		expect(live).toHaveLength(1);
		await rec.stop();
		rec.close();
		// Listening goes on after the take.
		expect(micOwners()).toEqual(['listen']);
		expect((listen as unknown as FakeStream).tracks[0].readyState).toBe('live');
		releaseMic('listen');
		expect((listen as unknown as FakeStream).tracks[0].readyState).toBe('ended');
	});

	it('gives the mic back when recording alone', async () => {
		const rec = new TakeRecorder();
		await rec.open();
		expect(micOwners()).toEqual([MIC_OWNER]);
		rec.close();
		expect(micOwners()).toEqual([]);
	});
});

describe('hands-free stop settings', () => {
	it('defaults to 2 passes of a loop and 8 s of silence', () => {
		expect(readPasses()).toBe(DEFAULT_PASSES);
		expect(readSilence()).toBe(DEFAULT_SILENCE_S);
		expect(DEFAULT_SILENCE_S).toBe(8);
		expect(alongStop(false, 2)).toBe('Stops at the end of the tab');
		expect(alongStop(true, 2)).toBe('Stops after 2 passes');
		expect(alongStop(true, 1)).toBe('Stops after 1 pass');
		expect(soloStop(8)).toBe('Stops after 8 s of silence');
		expect(soloStop(0)).toBe('Stop when you are done');
	});
});
