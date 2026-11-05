// Scoring one pass: heard onsets (latency-compensated, ms from the pass's first beat) matched to
// the expected notes. Pure and unit-tested; the live checker re-runs it as the pass plays.
//   - timing: |Δt| ≤ 50 ms perfect, ≤ 120 ms ok; further (inside the note's outer window) early/late.
//   - pitch: within ±50 cents of the expected note, octave errors folded into its octave (as the
//     tuner's octave guard does: deliberately beginner-friendly, an octave slip is not a wrong
//     note); an onset with no clear pitch is judged on timing alone and is at most `ok`.
//   - alignment: in order (non-crossing), so a dense passage played late reads as late.
//   - clean: ≥ 90 % accuracy, no wrong pitch, few unclear hits and few extra onsets.
import { foldToOctaveOf } from '../tuner/pitch';

export const PERFECT_MS = 50;
export const OK_MS = 120;
/** The farthest an onset may be from its note and still belong to it (early/late). */
export const OUTER_MS = 250;
export const CENTS_TOL = 50;
/** Clean: at least this share of the notes hit (perfect or ok), and no wrong pitch (see summarize). */
export const CLEAN_SHARE = 0.9;

export type Onset = {
	/** ms from the pass's first beat, latency already subtracted. */
	t: number;
	/** Detected frequency (Hz), null when the pitch was unclear. */
	freq: number | null;
};

export type NoteStatus = 'perfect' | 'ok' | 'early' | 'late' | 'wrong' | 'missed' | 'pending';

export type NoteResult = {
	status: NoteStatus;
	/** Onset − expected (ms), when an onset was matched. */
	dt?: number;
	/** Pitch error in cents after octave folding, when the onset had a pitch. */
	cents?: number;
	/** Soft notes (legato targets) that were not heard are not counted. */
	counted: boolean;
	/** Matched by an onset without a clear pitch (judged on timing alone, at most `ok`). */
	unclear?: boolean;
};

export type PassResult = {
	notes: NoteResult[];
	/** Onsets that matched no note. */
	extra: Onset[];
};

type Expected = { t: number; midi: number; soft?: boolean };

export const midiToFreq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Pitch error in cents after folding `freq` into the octave of `midi`. */
export function centsOff(freq: number, midi: number): number {
	const target = midiToFreq(midi);
	return 1200 * Math.log2(foldToOctaveOf(freq, target) / target);
}

/** Each note's outer window: OUTER_MS, shrunk so neighbouring notes never share an onset. */
function windows(notes: readonly Expected[]): number[] {
	return notes.map((n, i) => {
		const prev = i > 0 ? n.t - notes[i - 1].t : Infinity;
		const next = i + 1 < notes.length ? notes[i + 1].t - n.t : Infinity;
		const gap = Math.min(prev, next);
		return Math.max(OK_MS, Math.min(OUTER_MS, gap * 0.45));
	});
}

/** Alignment costs (ms-like units): a wrong pitch costs as much as being this far off time. */
const WRONG_COST = 150;
/** An onset with no clear pitch, against one of the right pitch at the same time. */
const UNCLEAR_COST = 20;
/** Each matched pair outweighs any timing cost: the alignment first explains as many notes as it can. */
const MATCH_REWARD = 1e6;

/**
 * Aligns onsets to notes one-to-one and in order (dynamic programming over both sequences: a
 * matched pair never crosses another, so one late passage of 16ths reads as all late, not as
 * one missed note, a row of perfect ones and an extra). Among alignments it maximises the
 * notes explained, then minimises the timing error plus a cost for wrong or unclear pitch.
 * Each pair must lie inside its note's window. `now` (ms, same clock) marks notes whose window
 * is still open as pending.
 *
 * Pitch: an onset without a clear pitch is judged on timing alone but counts at most as `ok`
 * (never `perfect`): the mic may have heard a knock, not the note.
 */
export function matchPass(
	notes: readonly Expected[],
	onsets: readonly Onset[],
	{ now = Infinity }: { now?: number } = {}
): PassResult {
	const win = windows(notes);
	const order = onsets.map((_, j) => j).sort((a, b) => onsets[a].t - onsets[b].t);
	const os = order.map((j) => onsets[j]);
	const N = notes.length;
	const M = os.length;
	const W = M + 1;
	// cost[i][j]: best cost of the first i notes against the first j onsets; move: 0 skip note,
	// 1 skip onset, 2 match.
	const cost = new Float64Array((N + 1) * W);
	const move = new Uint8Array((N + 1) * W);
	const centsAt = new Float64Array((N + 1) * W).fill(NaN);
	for (let i = 0; i <= N; i++)
		for (let j = 0; j <= M; j++) {
			if (i === 0 && j === 0) continue;
			const k = i * W + j;
			let best = Infinity;
			let m = 0;
			if (i > 0 && cost[k - W] < best) {
				best = cost[k - W];
				m = 0;
			}
			if (j > 0 && cost[k - 1] < best) {
				best = cost[k - 1];
				m = 1;
			}
			if (i > 0 && j > 0) {
				const n = notes[i - 1];
				const o = os[j - 1];
				const dt = o.t - n.t;
				if (Math.abs(dt) <= win[i - 1]) {
					const cents = o.freq === null ? null : centsOff(o.freq, n.midi);
					const pitch =
						cents === null ? UNCLEAR_COST : Math.abs(cents) > CENTS_TOL ? WRONG_COST : 0;
					const c = cost[k - W - 1] - MATCH_REWARD + Math.abs(dt) + pitch;
					if (c < best) {
						best = c;
						m = 2;
						centsAt[k] = cents ?? NaN;
					}
				}
			}
			cost[k] = best;
			move[k] = m;
		}
	const pairOf = new Int32Array(N).fill(-1);
	const pairCents: (number | null)[] = new Array(N).fill(null);
	for (let i = N, j = M; i > 0 || j > 0;) {
		const k = i * W + j;
		const m = move[k];
		if (m === 2) {
			pairOf[i - 1] = j - 1;
			pairCents[i - 1] = Number.isNaN(centsAt[k]) ? null : centsAt[k];
			i--;
			j--;
		} else if (m === 1) j--;
		else i--;
	}
	const used = new Set<number>();
	const results = notes.map((n, i): NoteResult => {
		const j = pairOf[i];
		if (j < 0) {
			const open = n.t + win[i] > now;
			return { status: open ? 'pending' : 'missed', counted: !n.soft };
		}
		used.add(j);
		const cents = pairCents[i];
		const dt = os[j].t - n.t;
		const base = { dt, counted: true, ...(cents !== null && { cents }) };
		if (cents !== null && Math.abs(cents) > CENTS_TOL) return { status: 'wrong', ...base };
		const a = Math.abs(dt);
		// No clear pitch: right time, unknown note. Never a full hit on a plucked note.
		const perfect = a <= PERFECT_MS && (cents !== null || n.soft);
		const status = perfect ? 'perfect' : a <= OK_MS ? 'ok' : dt < 0 ? 'early' : 'late';
		return { status, ...base, ...(cents === null && { unclear: true }) };
	});
	return { notes: results, extra: os.filter((_, j) => !used.has(j)) };
}

export type PassSummary = {
	total: number;
	hits: number;
	perfect: number;
	ok: number;
	early: number;
	late: number;
	wrong: number;
	missed: number;
	extra: number;
	/** Hits whose onset had no clear pitch. */
	unclear: number;
	/** hits / (total + extras beyond the allowance), 0..1 */
	accuracy: number;
	clean: boolean;
};

/** Clean allows at most this share of the hits to have no clear pitch... */
export const MAX_UNCLEAR_SHARE = 0.25;
/** ...and this many extra onsets per note (at least one): a stray knock is fine, a flurry is not. */
export const EXTRA_ALLOWANCE = 0.1;

export const extraAllowance = (total: number) => Math.max(1, Math.round(total * EXTRA_ALLOWANCE));

export function summarize(r: PassResult): PassSummary {
	const counted = r.notes.filter((n) => n.counted);
	const count = (s: NoteStatus) => counted.filter((n) => n.status === s).length;
	const perfect = count('perfect');
	const ok = count('ok');
	const hits = perfect + ok;
	const wrong = count('wrong');
	const total = counted.length;
	const unclear = counted.filter(
		(n) => n.unclear && (n.status === 'perfect' || n.status === 'ok')
	).length;
	const extra = r.extra.length;
	// Extras beyond the allowance count against accuracy like missed notes.
	const penalty = total ? Math.max(0, extra - extraAllowance(total)) : 0;
	const accuracy = total ? hits / (total + penalty) : 0;
	return {
		total,
		hits,
		perfect,
		ok,
		early: count('early'),
		late: count('late'),
		wrong,
		missed: count('missed') + count('pending'),
		extra,
		unclear,
		accuracy,
		clean:
			total > 0 &&
			accuracy >= CLEAN_SHARE &&
			wrong === 0 &&
			unclear <= Math.floor(total * MAX_UNCLEAR_SHARE) &&
			extra <= extraAllowance(total)
	};
}

/** "14/16 notes · 2 late · 1 wrong" (only the parts that happened). */
export function summaryText(s: PassSummary): string {
	const parts = [`${s.hits}/${s.total} notes`];
	if (s.late) parts.push(`${s.late} late`);
	if (s.early) parts.push(`${s.early} early`);
	if (s.wrong) parts.push(`${s.wrong} wrong`);
	if (s.missed) parts.push(`${s.missed} missed`);
	return parts.join(' · ');
}

/** The tab colour for a note: green on time, amber off time, red wrong or missed. */
export function noteColour(s: NoteStatus): 'good' | 'off' | 'bad' | null {
	if (s === 'perfect' || s === 'ok') return 'good';
	if (s === 'early' || s === 'late') return 'off';
	if (s === 'wrong' || s === 'missed') return 'bad';
	return null;
}

/** The glyph beside a note's colour (colour is never the only cue): ✓ ← → ✗ ○. */
export function noteGlyph(s: NoteStatus): string | null {
	if (s === 'perfect' || s === 'ok') return '✓';
	if (s === 'early') return '←';
	if (s === 'late') return '→';
	if (s === 'wrong') return '✗';
	if (s === 'missed') return '○';
	return null;
}
