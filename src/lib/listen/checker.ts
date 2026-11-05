// The live checker: the tab player's playback positions anchor each pass on the performance.now()
// clock, the mic's onsets are placed on it (minus the calibrated latency), and matchPass scores
// them as the pass plays. No Web Audio here (positions, onsets and "now" are fed in), so the pass
// bookkeeping is unit-tested with a fake clock.
//
// A pass is a list of segments, one per playback speed: the ladder may step its tempo while the
// next pass already plays (an auto-rating lands mid-pass), and the pass is still judged.
import { matchPass, summarize, type PassResult, type PassSummary } from './match';
import { tickToMs, strumWindows, type Timeline } from './timeline';
import { chordMatches } from './chroma';

/** Onsets this far around a pass still belong to it (early first note, late last note). */
const EDGE_MS = 300;
/** After the pass ends, wait this long for a late last note before summing up. */
const GRACE_MS = 300;
/** A pass whose first position came this far past its first note started mid-way (resume). */
const PARTIAL_MS = 250;
/**
 * "Didn't hear you": fewer than this share of the notes had any onset near them, or the loudest
 * mic level of the pass stayed under LEVEL_FLOOR (rms; a plucked note reads 0.01 and up, a quiet
 * room 0.001).
 */
export const HEARD_SHARE_MIN = 0.2;
export const LEVEL_FLOOR = 0.004;

export type CheckerOnset = { perf: number; freq: number | null; chroma?: number[] };

export type ChordBar = { bar: number; ok: boolean | null };

export type PassReport = {
	pass: number;
	result: PassResult;
	summary: PassSummary;
	/** Chord mode: per bar of the pass, whether the strums sounded the expected chord. */
	chords: ChordBar[];
	/** Share of the notes with any onset matched to them (0..1). */
	heard: number;
	/** Loudest mic level (rms) during the pass; null when no level readings came in. */
	level: number | null;
	/** Almost nothing was heard: not a pass to rate (the mic, not the player, is the problem). */
	silent: boolean;
	/** The pass was joined mid-way (resumed after a pause): not judged as a whole. */
	partial: boolean;
	/** performance.now() of the pass's first beat (tick 0). */
	origin: number;
};

type Segment = {
	fromTick: number;
	speed: number;
	/** performance.now() of tick 0 at this speed (perf = anchor + ms₁(tick) / speed). */
	anchor: number | null;
	samples: number[];
};

type Pass = { index: number; segs: Segment[]; done: boolean; void: boolean; partial: boolean };

/**
 * performance.now() of tick 0 from position samples (perf − ms(tick)): position events reach the
 * page a little late, never early, so the earliest ones are trusted (the 10th percentile).
 */
export function anchorOf(samples: readonly number[]): number | null {
	if (!samples.length) return null;
	const sorted = [...samples].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length * 0.1)];
}

export class LiveChecker {
	private timeline: Timeline | null = null;
	private passes: Pass[] = [];
	private onsets: CheckerOnset[] = [];
	/** Mic levels: [perf, rms] pairs, ten a second, the last two minutes. */
	private levels: [number, number][] = [];
	private lastTick = -1;
	latency = 0;

	constructor(
		private handlers: {
			/** While a pass plays (and once more when it is done). */
			update: (r: PassReport) => void;
			/** A pass played to its end. */
			done: (r: PassReport) => void;
		},
		private mode: 'notes' | 'chords' = 'notes'
	) {}

	private get current(): Pass | null {
		const p = this.passes[this.passes.length - 1];
		return p && !p.done && !p.void ? p : null;
	}

	private ms1(tick: number) {
		return tickToMs(tick, this.timeline!.map, 1);
	}

	/** A new score drops the pass in progress; a new tempo starts a new segment of it. */
	setTimeline(tl: Timeline) {
		const old = this.timeline;
		this.timeline = tl;
		if (!old) return;
		if (old.endTick !== tl.endTick || old.notes.length !== tl.notes.length) return this.abandon();
		const p = this.current;
		if (!p || old.speed === tl.speed) return;
		const seg = p.segs[p.segs.length - 1];
		const at = Math.max(0, this.lastTick);
		// Continuous at the tick playing now; refined by the positions that follow.
		const anchor =
			seg.anchor === null ? null : seg.anchor + this.ms1(at) * (1 / seg.speed - 1 / tl.speed);
		p.segs.push({ fromTick: at, speed: tl.speed, anchor, samples: [] });
	}

	setMode(mode: 'notes' | 'chords') {
		this.mode = mode;
	}

	/** A playback position (tick) seen at performance time `perf`. */
	position(tick: number, perf: number) {
		const tl = this.timeline;
		if (!tl) return;
		const wrapped = tick < this.lastTick - 240;
		if (wrapped || !this.current) this.newPass(wrapped, tick);
		this.lastTick = tick;
		// Tick 0 also shows during the count-in: only positions inside the pass place it.
		if (tick <= 0) return;
		const seg = this.current!.segs[this.current!.segs.length - 1];
		seg.samples.push(perf - this.ms1(tick) / seg.speed);
		if (seg.samples.length > 60) seg.samples.shift();
		// Position events reach the page a little late, never early: trust the earliest ones.
		if (seg.samples.length >= 3 || seg.anchor === null) seg.anchor = anchorOf(seg.samples);
	}

	private newPass(wrapped: boolean, tick: number) {
		const tl = this.timeline!;
		const first = tl.notes[0]?.tick ?? 0;
		const partial = !wrapped && (this.ms1(tick) - this.ms1(first)) / tl.speed > PARTIAL_MS;
		const prev = this.passes[this.passes.length - 1];
		const index = prev ? prev.index + 1 : 0;
		// A seamless loop: the next pass starts where the last one ended (refined by positions).
		const end = wrapped && prev ? this.perfAt(prev, tl.endTick) : null;
		this.passes.push({
			index,
			segs: [{ fromTick: 0, speed: tl.speed, anchor: end, samples: [] }],
			done: false,
			void: false,
			partial
		});
		if (this.passes.length > 4) this.passes.shift();
	}

	/** performance.now() at which `tick` of pass `p` plays (null before the pass is placed). */
	private perfAt(p: Pass, tick: number): number | null {
		let seg = p.segs[0];
		for (const s of p.segs) if (s.fromTick <= tick) seg = s;
		return seg.anchor === null ? null : seg.anchor + this.ms1(tick) / seg.speed;
	}

	onset(o: CheckerOnset) {
		this.onsets.push(o);
		if (this.onsets.length > 400) {
			const keep = o.perf - 120_000;
			this.onsets = this.onsets.filter((x) => x.perf > keep);
		}
	}

	/** A mic level reading (rms) at performance time `perf`. */
	level(perf: number, rms: number) {
		this.levels.push([perf, rms]);
		if (this.levels.length > 1500) this.levels.splice(0, 300);
	}

	/** Playback stopped: the pass in progress is dropped (a stopped pass is not rated). */
	abandon() {
		const p = this.current;
		if (p) p.void = true;
		this.lastTick = -1;
	}

	reset() {
		this.passes = [];
		this.onsets = [];
		this.levels = [];
		this.lastTick = -1;
	}

	/** Re-scores open passes at performance time `now`. */
	tick(now: number) {
		const tl = this.timeline;
		if (!tl) return;
		for (const p of this.passes) {
			if (p.done || p.void) continue;
			const origin = this.perfAt(p, 0);
			const end = this.perfAt(p, tl.endTick);
			if (origin === null || end === null) continue;
			const over = now - this.latency > end + GRACE_MS;
			const report = this.report(p, tl, origin, end, over ? Infinity : now - this.latency - origin);
			this.handlers.update(report);
			if (over) {
				p.done = true;
				this.handlers.done(report);
			}
		}
	}

	private report(p: Pass, tl: Timeline, origin: number, end: number, now: number): PassReport {
		const duration = end - origin;
		const heard = this.onsets
			.map((o) => ({ t: o.perf - this.latency - origin, freq: o.freq, chroma: o.chroma }))
			.filter((o) => o.t > -EDGE_MS && o.t < duration + EDGE_MS);
		const at = (tick: number) => this.perfAt(p, tick)! - origin;
		// The loudest level heard during the pass (latency-shifted like the onsets).
		let level: number | null = null;
		for (const [t, rms] of this.levels) {
			const rel = t - this.latency - origin;
			if (rel > -EDGE_MS && rel < Math.min(now, duration) + EDGE_MS)
				level = Math.max(level ?? 0, rms);
		}
		const quiet = level !== null && level < LEVEL_FLOOR;
		if (this.mode === 'chords') {
			const r = this.chordReport(p, tl, heard, now, at, origin);
			const silent = quiet || !heard.some((o) => o.chroma);
			return { ...r, level, silent, heard: silent ? 0 : 1 };
		}
		const notes = tl.notes.map((n) => ({ t: at(n.tick), midi: n.midi, soft: n.soft }));
		const result = matchPass(notes, heard, { now });
		const judged = result.notes.filter((n) => n.status !== 'pending');
		const any = judged.filter((n) => n.status !== 'missed').length;
		const share = judged.length ? any / judged.length : 0;
		return {
			pass: p.index,
			result,
			summary: summarize(result),
			chords: [],
			heard: share,
			level,
			silent: quiet || (judged.length > 0 && share < HEARD_SHARE_MIN),
			partial: p.partial,
			origin
		};
	}

	private chordReport(
		p: Pass,
		tl: Timeline,
		heard: { t: number; chroma?: number[] }[],
		now: number,
		at: (tick: number) => number,
		origin: number
	): PassReport {
		const bars = new Map<number, { ok: number; bad: number }>();
		for (const w of strumWindows(tl)) {
			const t = at(w.tick);
			const b = bars.get(w.bar) ?? { ok: 0, bad: 0 };
			bars.set(w.bar, b);
			const near = heard.filter((o) => o.chroma && Math.abs(o.t - t) <= 150);
			if (near.some((o) => chordMatches(o.chroma!, w.pcs))) b.ok++;
			else if (t + 150 <= now) b.bad++;
		}
		const chords = [...bars].map(([bar, b]) => ({
			bar,
			ok: b.ok + b.bad === 0 ? null : b.ok >= b.bad
		}));
		const result = { notes: [], extra: [] };
		return {
			pass: p.index,
			result,
			summary: summarize(result),
			chords,
			heard: 1,
			level: null,
			silent: false,
			partial: p.partial,
			origin
		};
	}
}
