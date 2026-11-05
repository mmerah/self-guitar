// M7 listening fixes: the shared mic owner and the audio session, the attempt's mic accuracy on the
// server, the checker's silence / partial-pass rules, the onset detector's preallocated rings and
// the pitch octave guard.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as at from '@coderline/alphatab';
import { api } from './api-context';
import type { LearnIndex } from '../../src/lib/learn/types';
import { buildTimeline, type TickLookupLike } from '../../src/lib/listen/timeline';
import { midiToFreq } from '../../src/lib/listen/match';
import { OnsetDetector } from '../../src/lib/listen/onset';
import { pitchOf } from '../../src/lib/listen/pitchAt';
import { pluckSamples, SAMPLE_RATE } from '../fixtures/pluck';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'self-guitar-m7-listen-'));

// ---- the shared mic --------------------------------------------------------------------------

type FakeTrack = { readyState: 'live' | 'ended'; stop: () => void; getSettings: () => object };
function fakeNavigator(rate = 48000) {
	const streams: { tracks: FakeTrack[] }[] = [];
	const session = { type: 'auto' };
	const getUserMedia = vi.fn(async () => {
		const track: FakeTrack = {
			readyState: 'live',
			stop: () => (track.readyState = 'ended'),
			getSettings: () => ({ sampleRate: rate })
		};
		const s = { tracks: [track] };
		streams.push(s);
		return {
			getTracks: () => s.tracks,
			getAudioTracks: () => s.tracks
		} as unknown as MediaStream;
	});
	vi.stubGlobal('navigator', { mediaDevices: { getUserMedia }, audioSession: session });
	return { streams, session, getUserMedia };
}

describe('shared mic owner (acquireMic / releaseMic)', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('opens one stream for every owner and stops it with the last release', async () => {
		const mic = await import('../../src/lib/tuner/mic');
		const nav = fakeNavigator();
		const a = await mic.acquireMic('tuner');
		const b = await mic.acquireMic('record');
		expect(a).toBe(b);
		expect(nav.getUserMedia).toHaveBeenCalledTimes(1);
		// The same owner twice counts once.
		await mic.acquireMic('tuner');
		expect(mic.micOwners().sort()).toEqual(['record', 'tuner']);
		mic.releaseMic('tuner');
		expect(nav.streams[0].tracks[0].readyState).toBe('live');
		mic.releaseMic('tuner'); // a second release is harmless
		expect(mic.micHeld()).toBe(true);
		mic.releaseMic('record');
		expect(nav.streams[0].tracks[0].readyState).toBe('ended');
		expect(mic.micHeld()).toBe(false);
		// The next owner gets a fresh stream.
		await mic.acquireMic('listen');
		expect(nav.getUserMedia).toHaveBeenCalledTimes(2);
		mic.releaseMic('listen');
	});

	it('owners asking while the prompt is open share the one request', async () => {
		const mic = await import('../../src/lib/tuner/mic');
		const nav = fakeNavigator();
		const [a, b] = await Promise.all([mic.acquireMic('x'), mic.acquireMic('y')]);
		expect(a).toBe(b);
		expect(nav.getUserMedia).toHaveBeenCalledTimes(1);
		mic.releaseMic('x');
		mic.releaseMic('y');
	});

	it('released while the prompt was open: the tracks stop as soon as they arrive', async () => {
		const mic = await import('../../src/lib/tuner/mic');
		const nav = fakeNavigator();
		const p = mic.acquireMic('tuner');
		mic.releaseMic('tuner');
		await p;
		expect(nav.streams[0].tracks[0].readyState).toBe('ended');
		expect(mic.micHeld()).toBe(false);
	});

	it('the iOS session is play-and-record while anyone holds the mic, playback otherwise', async () => {
		const mic = await import('../../src/lib/tuner/mic');
		const nav = fakeNavigator();
		mic.applyAudioSession();
		expect(nav.session.type).toBe('playback');
		const p = mic.acquireMic('listen');
		// Switched before the prompt (iOS needs it while the mic opens).
		expect(nav.session.type).toBe('play-and-record');
		await p;
		await mic.acquireMic('record');
		mic.releaseMic('listen');
		expect(nav.session.type).toBe('play-and-record');
		// Playback asking for its session does not take it away from the recorder.
		mic.applyAudioSession();
		expect(nav.session.type).toBe('play-and-record');
		mic.releaseMic('record');
		expect(nav.session.type).toBe('playback');
	});

	it('a refused mic leaves no owner behind and the session back on playback', async () => {
		const mic = await import('../../src/lib/tuner/mic');
		const nav = fakeNavigator();
		nav.getUserMedia.mockRejectedValueOnce(
			Object.assign(new Error('no'), { name: 'NotAllowedError' })
		);
		const err = await mic.acquireMic('listen').catch((e) => e);
		expect(mic.classifyMicError(err)).toBe('denied');
		expect(mic.micHeld()).toBe(false);
		expect(nav.session.type).toBe('playback');
	});

	it('getAudioContext never sets the session itself and rebuilds on a sample-rate change (iOS)', async () => {
		const closed: number[] = [];
		class FakeCtx {
			state = 'running';
			sampleRate = 48000;
			resume = async () => {};
			close = async () => {
				this.state = 'closed';
				closed.push(this.sampleRate);
			};
		}
		vi.stubGlobal('AudioContext', FakeCtx);
		const mic = await import('../../src/lib/tuner/mic');
		const { getAudioContext } = await import('../../src/lib/audio/context');
		const nav = fakeNavigator(24000);
		const ctx = getAudioContext('play-and-record');
		expect(nav.session.type).toBe('playback'); // the argument is ignored: no mic held
		await mic.acquireMic('tuner');
		expect(nav.session.type).toBe('play-and-record');
		expect(closed).toEqual([48000]);
		const fresh = getAudioContext();
		expect(fresh).not.toBe(ctx);
		mic.releaseMic('tuner');
	});
});

// ---- mic accuracy with the attempt ---------------------------------------------------------------

describe('attempt API: hits / total', () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	type Handler = (event: any) => Promise<Response>;
	let attempts: { POST: Handler };
	let exercise: { GET: Handler };
	let learn: LearnIndex;
	beforeAll(async () => {
		attempts = api('/api/exercises/[id]/attempts');
		exercise = api('/api/exercises/[id]');
		learn = await (await api('/api/learn').GET({})).json();
	});
	const req = (body: unknown) =>
		new Request('http://x', { method: 'POST', body: JSON.stringify(body) });
	const status = async (fn: () => Promise<Response>) => {
		try {
			return (await fn()).status;
		} catch (e) {
			return (e as { status: number }).status;
		}
	};

	it('stores the mic accuracy with the pass and lists the last five heard passes', async () => {
		const ex = learn.exercises.find((e) => e.id === 'first-notes-e-b')!;
		const post = (body: object) =>
			attempts.POST({ params: { id: ex.id }, request: req({ bpm: ex.startBpm, ...body }) });
		// Without the mic: no accuracy.
		let d = await (await post({ clean: true })).json();
		expect(d.heard).toEqual([]);
		for (const [hits, clean] of [
			[10, false],
			[12, false],
			[13, true],
			[14, true],
			[14, true],
			[11, false]
		] as const)
			d = await (await post({ clean, hits, total: 14 })).json();
		expect(d.heard).toHaveLength(5);
		expect(d.heard.map((p: { hits: number }) => p.hits)).toEqual([12, 13, 14, 14, 11]);
		expect(d.heard[4]).toMatchObject({ hits: 11, total: 14, clean: false, bpm: ex.startBpm });
		const fresh = await (await exercise.GET({ params: { id: ex.id } })).json();
		expect(fresh.heard).toEqual(d.heard);
	});

	it('Progress shows the mic accuracy per day', async () => {
		const today = new Date().toISOString().slice(0, 10);
		const h = await (
			await api('/api/history').GET({
				url: new URL(`http://localhost/api/history?date=${today}&tz=UTC`)
			})
		).json();
		// 10+12+13+14+14+11 of 6×14 (the passes above).
		expect(h.micAccuracy).toEqual([{ date: today, value: Math.round((100 * 74) / 84) }]);
	});

	it('rejects half or impossible accuracy', async () => {
		const ex = learn.exercises.find((e) => e.id === 'first-notes-e-b')!;
		const post = (body: object) => () =>
			attempts.POST({
				params: { id: ex.id },
				request: req({ bpm: ex.startBpm, clean: true, ...body })
			});
		expect(await status(post({ hits: 3 }))).toBe(400);
		expect(await status(post({ total: 3 }))).toBe(400);
		expect(await status(post({ hits: 5, total: 4 }))).toBe(400);
		expect(await status(post({ hits: 0, total: 0 }))).toBe(400);
		expect(await status(post({ hits: 4, total: 4 }))).toBe(201);
	});
});

// ---- the checker: silence and partial passes -----------------------------------------------------

function lookupOf(tex: string): TickLookupLike {
	const settings = new at.Settings();
	const imp = new at.importer.AlphaTexImporter();
	imp.initFromString(tex, settings);
	const gen = new at.midi.MidiFileGenerator(
		imp.readScore(),
		settings,
		new at.midi.AlphaSynthMidiFileHandler(new at.midi.MidiFile())
	);
	gen.generate();
	return gen.tickLookup as unknown as TickLookupLike;
}
const head =
	'\\tempo 80\n\\track ("Guitar") { instrument acousticguitarsteel }\n\\staff { tabs }\n\\ts (4 4)\n';

describe('live checker: what is not a pass to rate', () => {
	async function setup() {
		const { LiveChecker } = await import('../../src/lib/listen/checker');
		const tl = buildTimeline(lookupOf(head + ':4 0.1 1.1 3.1 1.1 | 0.1 1.1 3.1 1.1'));
		const done: import('../../src/lib/listen/checker').PassReport[] = [];
		const c = new LiveChecker({ update: () => {}, done: (r) => done.push(r) });
		c.setTimeline(tl); // 8 notes, 750 ms apart, 6 s per pass
		const play = (from: number, passStart: number, until = passStart + 6000) => {
			for (let t = from; t < until; t += 40) {
				const tick = Math.round(((t - passStart) / 750) * 960);
				if (tick > 0) c.position(tick, t);
			}
		};
		return { c, done, play };
	}

	it('a silent pass (no onsets, quiet levels) is reported silent', async () => {
		const { c, done, play } = await setup();
		c.position(0, 900);
		play(1000, 1000);
		for (let t = 1000; t < 7000; t += 100) c.level(t, 0.0008);
		c.tick(7400);
		expect(done).toHaveLength(1);
		expect(done[0]).toMatchObject({ silent: true, heard: 0, partial: false });
		expect(done[0].level).toBeCloseTo(0.0008, 6);
	});

	it('loud but only one note in eight heard: still "didn\'t hear you"', async () => {
		const { c, done, play } = await setup();
		c.position(0, 900);
		play(1000, 1000);
		for (let t = 1000; t < 7000; t += 100) c.level(t, 0.05);
		c.onset({ perf: 1010, freq: midiToFreq(64) });
		c.tick(7400);
		expect(done[0].heard).toBeCloseTo(1 / 8, 6);
		expect(done[0].silent).toBe(true);
	});

	it('a pass played is not silent', async () => {
		const { c, done, play } = await setup();
		c.position(0, 900);
		play(1000, 1000);
		for (let t = 1000; t < 7000; t += 100) c.level(t, 0.05);
		[64, 65, 67, 65, 64, 65, 67, 65].forEach((m, i) =>
			c.onset({ perf: 1000 + i * 750 + 15, freq: midiToFreq(m) })
		);
		c.tick(7400);
		expect(done[0]).toMatchObject({ silent: false, heard: 1 });
		expect(done[0].summary.clean).toBe(true);
	});

	it('a pass joined mid-way (resumed after a pause) is partial', async () => {
		const { c, done, play } = await setup();
		play(4000, 1000, 7000); // first position at 3 s into the pass
		c.tick(7400);
		expect(done[0].partial).toBe(true);
	});
});

// ---- onsets without per-block allocation; the pitch octave guard -----------------------------------

describe('onset detector rings', () => {
	it('reuses one result array and finds the same onsets through ring wrap-around', () => {
		const out = new Float32Array(SAMPLE_RATE * 2);
		for (const t of [0.3, 0.8, 1.3]) {
			const s = pluckSamples(midiToFreq(52), [{ amp: 1, decay: 3 }], 0.6);
			const i0 = Math.round(t * SAMPLE_RATE);
			for (let i = 0; i < s.length && i0 + i < out.length; i++) out[i0 + i] += 0.4 * s[i];
		}
		const d = new OnsetDetector({ sampleRate: SAMPLE_RATE });
		const frames: number[] = [];
		let first: unknown = null;
		for (let f = 0; f + 128 <= out.length; f += 128) {
			const ev = d.process(out.subarray(f, f + 128), f);
			first ??= ev;
			expect(ev).toBe(first);
			for (const e of ev) frames.push(e.frame);
		}
		expect(frames.map((f) => Math.round((f / SAMPLE_RATE) * 100) / 100)).toEqual([0.3, 0.8, 1.3]);
	});
});

describe('pitch octave guard', () => {
	it('folds stray octave readings to the median reading, not to the lowest', () => {
		// A G3 whose first frames read an octave low (a sub-harmonic at the attack).
		const g3 = midiToFreq(55);
		const s = pluckSamples(
			g3,
			[
				{ amp: 1, decay: 2 },
				{ amp: 0.4, decay: 3 }
			],
			0.3
		);
		const low = pluckSamples(g3 / 2, [{ amp: 1, decay: 2 }], 0.06);
		for (let i = 0; i < low.length; i++) s[i] = low[i];
		const p = pitchOf(s, SAMPLE_RATE);
		expect(p).not.toBeNull();
		expect(Math.abs(1200 * Math.log2(p!.freq / g3))).toBeLessThan(30);
	});
});

describe('suggested rating (AutoRate)', () => {
	afterEach(() => vi.useRealTimers());
	const summary = (clean: boolean, hits: number) =>
		({ clean, hits, total: 14 }) as import('../../src/lib/listen/match').PassSummary;

	it('saves itself after the countdown', async () => {
		vi.useFakeTimers();
		const { AutoRate } = await import('../../src/lib/listen/autorate.svelte');
		const rated: [boolean, number][] = [];
		const a = new AutoRate((c, s) => rated.push([c, s.hits]), 5);
		a.offer(summary(true, 14));
		vi.advanceTimersByTime(4000);
		expect(a.pending?.left).toBe(1);
		expect(rated).toEqual([]);
		vi.advanceTimersByTime(1000);
		expect(rated).toEqual([[true, 14]]);
		expect(a.pending).toBeNull();
	});

	it('a short pass rates the pending suggestion before offering its own', async () => {
		vi.useFakeTimers();
		const { AutoRate } = await import('../../src/lib/listen/autorate.svelte');
		const rated: [boolean, number][] = [];
		const a = new AutoRate((c, s) => rated.push([c, s.hits]), 5);
		a.offer(summary(true, 14));
		vi.advanceTimersByTime(2000);
		a.offer(summary(false, 9)); // the next pass ended within the countdown
		expect(rated).toEqual([[true, 14]]);
		vi.advanceTimersByTime(5000);
		expect(rated).toEqual([
			[true, 14],
			[false, 9]
		]);
	});

	it('a rating by hand takes the suggestion (with its pass) and stops the countdown', async () => {
		vi.useFakeTimers();
		const { AutoRate } = await import('../../src/lib/listen/autorate.svelte');
		const rated: boolean[] = [];
		const a = new AutoRate((c) => rated.push(c), 5);
		a.offer(summary(false, 9));
		expect(a.take()?.summary.hits).toBe(9);
		vi.advanceTimersByTime(10_000);
		expect(rated).toEqual([]);
	});
});
