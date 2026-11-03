// Auto-fingering for imported scores: a Viterbi (dynamic programming) choice of string and fret for
// every note, over the layered graph of onsets (docs/research/m5/pipeline.md §3). Pure: notes in,
// positions out; scripts/import applies it to an alphaTab score and content:check enforces the caps.
//
// Strings are 0 = low E … 5 = high e here (alphaTab's model counts 1 = low E; alphaTex's `fret.string`
// counts 6 = low E).

/** Standard tuning, low E to high e (MIDI). */
export const STANDARD_TUNING = [40, 45, 50, 55, 59, 64];

/** Highest fret a level may use: L1–3 first position (5), L4 (7), L5+ up to the 12th. */
export function fretCap(level: number): number {
	return level <= 3 ? 5 : level === 4 ? 7 : 12;
}

/** Most notes struck together: four (thumb + three fingers) below Level 5, else six. */
export function noteCap(level: number): number {
	return level < 5 ? 4 : 6;
}

/** A note to finger: when it starts and stops sounding (any time unit) and its pitch. */
export type NoteEvent = {
	id: number;
	start: number;
	end: number;
	pitch: number;
	/** A string the source asks for (0 = low E): kept when playable. */
	string?: number;
};

export type Position = { string: number; fret: number };

export type FingeringResult = {
	/** Note id → position (dropped notes are absent). */
	positions: Map<number, Position>;
	/** Notes left out: more than `maxNotes` at once, or no playable shape with them. */
	dropped: number[];
	/** Onset times needing a human look (a fret above the cap, a dropped note, a re-struck held note). */
	flagged: { time: number; reason: string }[];
};

export type FingeringOptions = {
	maxFret: number;
	maxNotes?: number;
	tuning?: number[];
};

type Layer = { time: number; notes: NoteEvent[]; held: number };
type Cand = { strings: number[]; frets: number[]; cost: number; over: boolean };

/** Onset layers: the notes struck at each time (held notes from earlier onsets first). */
export function layers(events: NoteEvent[]): Layer[] {
	const times = [...new Set(events.map((e) => e.start))].sort((a, b) => a - b);
	return times.map((time) => {
		const held = events.filter((e) => e.start < time && e.end > time).sort((a, b) => a.id - b.id);
		const struck = events
			.filter((e) => e.start === time)
			.sort((a, b) => a.pitch - b.pitch || a.id - b.id);
		return { time, notes: [...held, ...struck], held: held.length };
	});
}

/** Every assignment of the notes to distinct strings with frets 0…maxFret. */
function shapes(
	notes: NoteEvent[],
	tuning: number[],
	maxFret: number
): { strings: number[]; frets: number[] }[] {
	const out: { strings: number[]; frets: number[] }[] = [];
	const strings: number[] = [];
	const frets: number[] = [];
	const rec = (i: number, used: number) => {
		if (out.length > 4000) return;
		if (i === notes.length) {
			out.push({ strings: [...strings], frets: [...frets] });
			return;
		}
		const want = notes[i].string;
		for (let s = 0; s < tuning.length; s++) {
			if (used & (1 << s)) continue;
			if (
				want !== undefined &&
				want >= 0 &&
				want < tuning.length &&
				s !== want &&
				playable(notes[i].pitch, want, tuning, maxFret)
			)
				continue;
			const f = notes[i].pitch - tuning[s];
			if (f < 0 || f > maxFret) continue;
			strings.push(s);
			frets.push(f);
			rec(i + 1, used | (1 << s));
			strings.pop();
			frets.pop();
		}
	};
	rec(0, 0);
	return out;
}

const playable = (pitch: number, s: number, tuning: number[], maxFret: number) =>
	pitch - tuning[s] >= 0 && pitch - tuning[s] <= maxFret;

/**
 * Static cost of a shape: low positions and open strings preferred, wide stretches and more
 * fretted notes than fingers penalised, bass notes kept on the bass strings.
 */
function shapeCost(
	strings: number[],
	frets: number[],
	maxFret: number,
	notes: NoteEvent[]
): number {
	const fretted = frets.filter((f) => f > 0);
	let cost = 0;
	if (fretted.length) {
		const hi = Math.max(...fretted);
		const lo = Math.min(...fretted);
		cost += hi * 1.0 + fretted.length * 0.3;
		const span = hi - lo;
		const reach = maxFret <= 5 ? 2 : 3;
		if (span > reach) cost += (span - reach) * 10;
		if (fretted.length > 4) cost += (fretted.length - 4) * 30;
	}
	cost -= (frets.length - fretted.length) * 0.5;
	// Pitch order should follow string order (a higher note on a lower string is awkward).
	for (let i = 0; i < notes.length; i++)
		for (let j = i + 1; j < notes.length; j++) {
			const di = notes[j].pitch - notes[i].pitch;
			const ds = strings[j] - strings[i];
			if (di && ds && Math.sign(di) !== Math.sign(ds)) cost += 4;
		}
	return cost;
}

/**
 * Hand positions a shape can be played from: the index finger's fret p with every fretted note in
 * p…p+3 (one finger per fret). Open strings fit anywhere (null).
 */
const positions = (frets: number[]): [number, number] | null => {
	const f = frets.filter((x) => x > 0);
	if (!f.length) return null;
	return [Math.max(1, Math.max(...f) - 3), Math.min(...f)];
};

/** Frets the hand has to move between two shapes (0 when one position plays both). */
export function shift(a: number[], b: number[]): number {
	const pa = positions(a);
	const pb = positions(b);
	if (!pa || !pb) return 0;
	return pb[0] > pa[1] ? pb[0] - pa[1] : pa[0] > pb[1] ? pa[0] - pb[1] : 0;
}

function candidates(layer: Layer, tuning: number[], maxFret: number): Cand[] {
	const make = (cap: number, over: boolean) =>
		shapes(layer.notes, tuning, cap).map((s) => ({
			...s,
			over,
			cost: shapeCost(s.strings, s.frets, maxFret, layer.notes) + (over ? 50 : 0)
		}));
	const within = make(maxFret, false);
	if (within.length) return within;
	return make(Math.max(maxFret, 12), true).filter((c) => c.frets.some((f) => f > maxFret));
}

/** Leaves out inner notes of an onset (the bass and the top melody note stay) until it fits. */
function thin(struck: NoteEvent[], keep: number): { kept: NoteEvent[]; dropped: NoteEvent[] } {
	if (struck.length <= keep) return { kept: struck, dropped: [] };
	const sorted = [...struck].sort((a, b) => a.pitch - b.pitch);
	const kept = [sorted[0], ...sorted.slice(sorted.length - (keep - 1))];
	return { kept, dropped: sorted.filter((n) => !kept.includes(n)) };
}

/**
 * Fingers a piece. Held notes keep the string they were struck on (a transition that moves one is
 * infeasible), so two or three voices are fingered together, as a guitarist plays them.
 */
export function fingerNotes(events: NoteEvent[], opts: FingeringOptions): FingeringResult {
	const tuning = opts.tuning ?? STANDARD_TUNING;
	const maxNotes = opts.maxNotes ?? 6;
	const flagged: FingeringResult['flagged'] = [];
	const dropped = new Set<number>();

	// Notes nobody can play (below the lowest string or above fret 12 on the top one) go first.
	const top = tuning[tuning.length - 1] + 12;
	let live = events.filter((e) => {
		const ok = e.pitch >= tuning[0] && e.pitch <= top;
		if (!ok) {
			dropped.add(e.id);
			flagged.push({ time: e.start, reason: `pitch ${e.pitch} is outside the guitar's range` });
		}
		return ok;
	});
	// Too many notes struck (or sounding) at once: thin the onset.
	for (const l of layers(live)) {
		const struck = l.notes.slice(l.held);
		const room = Math.max(1, maxNotes - l.held);
		const { dropped: out } = thin(struck, room);
		for (const n of out) dropped.add(n.id);
		if (out.length)
			flagged.push({
				time: l.time,
				reason: `left out ${out.length} inner note(s): more than ${maxNotes} at once`
			});
	}
	live = live.filter((e) => !dropped.has(e.id));

	// Onsets without any shape (e.g. two notes only one string can play): drop inner notes.
	let ls = layers(live);
	for (let guard = 0; guard < 50; guard++) {
		const bad = ls.find((l) => !candidates(l, tuning, opts.maxFret).length);
		if (!bad) break;
		const struck = bad.notes.slice(bad.held);
		const victim =
			struck.length > 1
				? thin(struck, struck.length - 1).dropped[0]
				: [...bad.notes].sort((a, b) => a.start - b.start)[0];
		dropped.add(victim.id);
		flagged.push({ time: bad.time, reason: 'left out a note: no playable shape' });
		live = live.filter((e) => e.id !== victim.id);
		ls = layers(live);
	}

	const cands = ls.map((l) => candidates(l, tuning, opts.maxFret));
	// Viterbi over the layers.
	type Cell = { cost: number; back: number; restruck: boolean };
	const table: Cell[][] = [];
	table.push(cands[0]?.map((c) => ({ cost: c.cost, back: -1, restruck: false })) ?? []);
	for (let i = 1; i < ls.length; i++) {
		const prev = ls[i - 1];
		const cur = ls[i];
		const prevIdx = new Map(prev.notes.map((n, k) => [n.id, k]));
		const row: Cell[] = cands[i].map((c) => {
			let best = Infinity;
			let back = -1;
			let restruck = false;
			cands[i - 1].forEach((p, j) => {
				let t = 0;
				let moved = false;
				for (let k = 0; k < cur.held; k++) {
					const pk = prevIdx.get(cur.notes[k].id);
					if (pk !== undefined && p.strings[pk] !== c.strings[k]) moved = true;
				}
				if (moved) t += 100;
				t += 2 * shift(p.frets, c.frets);
				const v = table[i - 1][j].cost + t;
				if (v < best) {
					best = v;
					back = j;
					restruck = moved;
				}
			});
			return { cost: best + c.cost, back, restruck };
		});
		table.push(row);
	}

	const positions = new Map<number, Position>();
	if (ls.length) {
		// Backtrack the cheapest path, then give every note the position of the layer that struck it.
		const path: number[] = [];
		const last = table[table.length - 1];
		let k = last.reduce((bi, x, i) => (x.cost < last[bi].cost ? i : bi), 0);
		for (let i = ls.length - 1; i >= 0; i--) {
			path[i] = k;
			k = table[i][k].back;
		}
		ls.forEach((l, i) => {
			const c = cands[i][path[i]];
			l.notes.forEach((n, j) => {
				if (j >= l.held) positions.set(n.id, { string: c.strings[j], fret: c.frets[j] });
			});
			if (c.over)
				flagged.push({
					time: l.time,
					reason: `fret ${Math.max(...c.frets)} is above the cap (${opts.maxFret})`
				});
			if (table[i][path[i]].restruck)
				flagged.push({ time: l.time, reason: 'a held note had to move string (re-struck)' });
		});
	}
	flagged.sort((a, b) => a.time - b.time);
	return { positions, dropped: [...dropped], flagged };
}

/**
 * Octave shift that puts a piece on the guitar: Mutopia MIDI files are at written pitch (an octave
 * above sounding) or at sounding pitch. Picks the shift (−24…+12) whose notes all sit at or above
 * the low E with the fewest above the fret cap.
 */
export function octaveShift(pitches: number[], maxFret: number, tuning = STANDARD_TUNING): number {
	if (!pitches.length) return 0;
	const lo = Math.min(...pitches);
	const capTop = tuning[tuning.length - 1] + maxFret;
	let best = 0;
	let bestScore = Infinity;
	for (const shift of [-24, -12, 0, 12]) {
		if (lo + shift < tuning[0]) continue;
		const over = pitches.filter((p) => p + shift > capTop).length;
		// Ties: the lower octave (the guitar's own register).
		const score = over * 1000 + (lo + shift - tuning[0]);
		if (score < bestScore) {
			bestScore = score;
			best = shift;
		}
	}
	return best;
}
