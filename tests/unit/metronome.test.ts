import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { LOOKAHEAD_S, Metronome } from '../../src/lib/metronome/scheduler';
import {
	barsToNextStep,
	clampBpm,
	type Click,
	type SpeedTrainer,
	secondsPerBeat,
	tapTempo,
	Timeline,
	trainerBpm,
	type TimelineSettings
} from '../../src/lib/metronome/timeline';

const settings = (s: Partial<TimelineSettings> = {}): TimelineSettings => ({
	bpm: 120,
	timeSignature: '4/4',
	subdivision: 1,
	accent: true,
	...s
});

/** Every click before `horizon`. */
function until(tl: Timeline, horizon: number): Click[] {
	const out: Click[] = [];
	while (tl.nextTime < horizon) out.push(tl.next());
	return out;
}

describe('metronome timeline', () => {
	it('spaces beats by 60/BPM and accents beat 1', () => {
		const tl = new Timeline(() => settings(), 10);
		const clicks = until(tl, 12.01);
		expect(clicks.map((c) => c.time)).toEqual([10, 10.5, 11, 11.5, 12]);
		expect(clicks.map((c) => c.level)).toEqual(['accent', 'beat', 'beat', 'beat', 'accent']);
		expect(clicks.map((c) => c.bar)).toEqual([0, 0, 0, 0, 1]);
		expect(secondsPerBeat(60)).toBe(1);
	});

	it('subdivides beats (8ths, triplets, 16ths)', () => {
		const triplets = until(new Timeline(() => settings({ bpm: 60, subdivision: 3 }), 0), 1.01);
		expect(triplets.map((c) => +c.time.toFixed(4))).toEqual([0, 0.3333, 0.6667, 1]);
		expect(triplets.map((c) => c.level)).toEqual(['accent', 'sub', 'sub', 'beat']);
		const sixteenths = until(new Timeline(() => settings({ subdivision: 4 }), 0), 0.5);
		expect(sixteenths).toHaveLength(4);
		expect(sixteenths[1].time).toBeCloseTo(0.125);
	});

	it('handles 3/4 and 6/8 bars, and no accent when off', () => {
		const waltz = until(new Timeline(() => settings({ timeSignature: '3/4' }), 0), 1.6);
		expect(waltz.map((c) => c.beat)).toEqual([0, 1, 2, 0]);
		const six = until(new Timeline(() => settings({ timeSignature: '6/8' }), 0), 3);
		expect(six.slice(0, 6).map((c) => c.level)).toEqual([
			'accent',
			'beat',
			'beat',
			'strong',
			'beat',
			'beat'
		]);
		const flat = until(new Timeline(() => settings({ accent: false }), 0), 0.1);
		expect(flat[0].level).toBe('beat');
	});

	it('applies a tempo change from the next click', () => {
		let bpm = 60;
		const tl = new Timeline(() => settings({ bpm }), 0);
		until(tl, 0.5); // click at 0, next at 1
		bpm = 120;
		const clicks = until(tl, 2.1);
		expect(clicks.map((c) => c.time)).toEqual([1, 1.5, 2]);
	});

	it('peeks the coming downbeat for the speed trainer', () => {
		const tl = new Timeline(() => settings({ timeSignature: '2/4' }), 0);
		expect(tl.peekBar()).toBe(0);
		tl.next();
		expect(tl.peekBar()).toBeNull();
		tl.next();
		expect(tl.peekBar()).toBe(1);
	});

	it('goes to the next downbeat when the bar gets shorter mid-bar', () => {
		let st = settings({ subdivision: 4 });
		const tl = new Timeline(() => st, 0);
		for (let i = 0; i < 13; i++) tl.next(); // up to beat 4, first 16th
		st = settings({ timeSignature: '3/4', subdivision: 2 });
		expect(tl.peekBar()).toBe(1); // beat 4 no longer exists: no phantom beat
		expect(tl.next()).toMatchObject({ bar: 1, beat: 0, sub: 0, level: 'accent' });
	});
});

/** A Metronome on a fake clock; `advance` moves time and runs the scheduler like the ticker. */
function fakeMetronome(get: () => TimelineSettings, trainer?: () => SpeedTrainer) {
	const ctx = { currentTime: 0 } as AudioContext;
	const played: { time: number; level: string }[] = [];
	const m = new Metronome(ctx, {
		settings: get,
		trainer,
		sound: (_c, time, level) => played.push({ time, level })
	});
	const advance = (to: number) => {
		(ctx as { currentTime: number }).currentTime = to;
		m.schedule();
	};
	return { m, played, advance, queue: () => (m as unknown as { queue: Click[] }).queue };
}

describe('metronome scheduler', () => {
	beforeAll(() => {
		globalThis.requestAnimationFrame ??= () => 0;
		globalThis.cancelAnimationFrame ??= () => {};
	});
	let stop: (() => void) | undefined;
	afterEach(() => stop?.());

	it('schedules only inside the lookahead window', () => {
		const { m, played, advance } = fakeMetronome(() => settings({ bpm: 60 }));
		stop = () => m.destroy();
		m.start(); // first click at 0.06
		expect(played).toHaveLength(1);
		advance(0.5);
		expect(played).toHaveLength(1); // nothing new until time moves on
		advance(1.06 - LOOKAHEAD_S + 0.01);
		expect(played.map((p) => p.time)).toEqual([0.06, 1.06]);
	});

	it("drops heard clicks so the queue doesn't grow while hidden", () => {
		const { m, advance, queue } = fakeMetronome(() => settings({ bpm: 240 }));
		stop = () => m.destroy();
		m.start();
		for (let t = 0; t < 30; t += 0.025) advance(t);
		expect(queue().length).toBeLessThanOrEqual(3);
	});
});

describe('speed trainer in the scheduler', () => {
	const trainer: SpeedTrainer = { enabled: true, step: 4, everyBars: 2, target: 100 };
	let stop: (() => void) | undefined;
	afterEach(() => stop?.());

	/** Plays 2/4 at 60 BPM (one bar = 2 s) and returns the tempo of each downbeat heard. */
	function run(bpm = { value: 84 }, t = trainer) {
		const get = () => settings({ bpm: bpm.value, timeSignature: '2/4' });
		const f = fakeMetronome(get, () => t);
		stop = () => f.m.destroy();
		f.m.start();
		const tempos: number[] = [];
		let last = 0;
		const until = (time: number) => {
			for (; last < time; last += 0.02) f.advance(last);
		};
		return { ...f, tempos, until };
	}

	it('ramps from the base tempo without touching it', () => {
		const bpm = { value: 84 };
		const r = run(bpm);
		const gaps: number[] = [];
		r.until(30);
		const downbeats = r.played.filter((p) => p.level === 'accent').map((p) => p.time);
		for (let i = 1; i < downbeats.length; i++)
			gaps.push(+(downbeats[i] - downbeats[i - 1]).toFixed(4));
		// Bars 1-2 at 84, bars 3-4 at 88 ... (2 beats per bar).
		expect(gaps[0]).toBeCloseTo(120 / 84, 4);
		expect(gaps[2]).toBeCloseTo(120 / 88, 4);
		expect(bpm.value).toBe(84); // the saved base tempo is never overwritten
		expect(r.m.barsToNextStep(2)).toBe(2);
		expect(r.m.barsToNextStep(3)).toBe(1);
	});

	it('applies a manual tempo change at once and ramps from it', () => {
		const bpm = { value: 84 };
		const r = run(bpm);
		r.until(9); // tempo has stepped to 88 by now
		bpm.value = 70; // the user picks 70...
		r.m.userTempo();
		r.until(12);
		const next = r.played.filter((p) => p.time > 9.6);
		expect(next[1].time - next[0].time).toBeCloseTo(60 / 70, 4);
	});

	it('stops at the target and says so', () => {
		expect(barsToNextStep(84, 2, trainer)).toBe(2);
		expect(barsToNextStep(84, 3, trainer)).toBe(1);
		expect(barsToNextStep(84, 8, trainer)).toBeNull(); // 84 + 4 * 4 = 100
		expect(barsToNextStep(120, 0, trainer)).toBeNull(); // already above
	});
});

describe('speed trainer', () => {
	const trainer = { enabled: true, step: 5, everyBars: 4, target: 100 };
	it('adds N BPM every M bars up to the target', () => {
		expect(trainerBpm(80, 0, trainer)).toBe(80);
		expect(trainerBpm(80, 3, trainer)).toBe(80);
		expect(trainerBpm(80, 4, trainer)).toBe(85);
		expect(trainerBpm(80, 12, trainer)).toBe(95);
		expect(trainerBpm(80, 400, trainer)).toBe(100);
		expect(trainerBpm(80, 8, { ...trainer, enabled: false })).toBe(80);
		expect(trainerBpm(120, 8, trainer)).toBe(120); // target below start: no change
	});
});

describe('tap tempo', () => {
	it('averages recent taps and restarts after a pause', () => {
		expect(tapTempo([1000])).toBeNull();
		expect(tapTempo([0, 500])).toBe(120);
		expect(tapTempo([0, 600, 1200, 1800])).toBe(100);
		// The 5 s gap starts a new measurement: only the last two taps count.
		expect(tapTempo([0, 500, 5500, 6250])).toBe(80);
		expect(tapTempo([0, 100])).toBe(250); // clamped
		expect(clampBpm(10)).toBe(30);
	});
});
