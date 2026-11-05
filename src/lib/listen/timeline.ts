// The expected timeline of an exercise: every note onset, in milliseconds, at the tempo that plays.
// Built from alphaTab's tick lookup (the same one its player uses, so repeats and tempo changes are
// unrolled exactly as they sound). Pure: it reads plain objects shaped like alphaTab's model, so it
// is unit-tested in Node with alphaTab's importer and MIDI generator.

/** alphaTab's MIDI resolution: ticks per quarter note. */
export const QUARTER_TICKS = 960;

type NoteLike = {
	fret: number;
	/** alphaTab counts strings from the lowest (1) up. */
	string: number;
	realValue: number;
	isTieDestination?: boolean;
	isDead?: boolean;
	isHammerPullDestination?: boolean;
	slideOrigin?: unknown;
	isPercussion?: boolean;
};
type BeatLike = {
	notes: NoteLike[];
	isRest?: boolean;
	voice?: { bar?: { staff?: { index?: number; track?: { index?: number }; tuning?: number[] } } };
};
type MasterBarLookupLike = {
	start: number;
	end: number;
	tempoChanges: readonly { tick: number; tempo: number }[];
	firstBeat: BeatLookupLike | null;
	masterBar?: { index: number };
};
type BeatLookupLike = {
	highlightedBeats: readonly { beat: BeatLike; playbackStart: number }[];
	nextBeat: BeatLookupLike | null;
};
export type TickLookupLike = { masterBars: readonly MasterBarLookupLike[] };

export type ExpectedNote = {
	/** Onset in ms from the first beat of the pass (count-in excluded). */
	t: number;
	tick: number;
	midi: number;
	/** 1 = high e … 6 = low E (as tabs are read). */
	string: number;
	fret: number;
	/** 0-based bar index in the score (repeats point to the same bar). */
	bar: number;
	/** Hammer-on / pull-off / slide target: often no clear attack, so never counted as missed. */
	soft: boolean;
	/** Index of the note in the beat (for chords; 0 on single notes). */
	index: number;
	/** The alphaTab note itself (for colouring); not serialised. */
	ref?: unknown;
};

export type TempoPoint = { tick: number; tempo: number };

/** The tempo map of a lookup, in playback order (first point at tick 0). */
export function tempoMap(lookup: TickLookupLike, fallback = 120): TempoPoint[] {
	const points: TempoPoint[] = [];
	for (const mb of lookup.masterBars)
		for (const c of mb.tempoChanges) {
			const last = points[points.length - 1];
			if (last && last.tick === c.tick) last.tempo = c.tempo;
			else if (!last || last.tempo !== c.tempo) points.push({ tick: c.tick, tempo: c.tempo });
		}
	if (!points.length || points[0].tick > 0) points.unshift({ tick: 0, tempo: fallback });
	return points;
}

/** Milliseconds from tick 0 to `tick` at playback speed `speed` (1 = the written tempo). */
export function tickToMs(tick: number, map: readonly TempoPoint[], speed = 1): number {
	let ms = 0;
	for (let i = 0; i < map.length; i++) {
		const from = map[i].tick;
		if (from >= tick) break;
		const to = Math.min(tick, i + 1 < map.length ? map[i + 1].tick : Infinity);
		ms += ((to - from) * 60000) / (QUARTER_TICKS * map[i].tempo);
	}
	return ms / speed;
}

export type TimelineOptions = {
	/** playbackSpeed (ladder BPM / written tempo). */
	speed?: number;
	/** Which track / staff is checked (default: the first). */
	track?: number;
	staff?: number;
	fallbackTempo?: number;
};

export type Timeline = {
	notes: ExpectedNote[];
	/** One pass, ms (end of the last bar). */
	duration: number;
	endTick: number;
	map: TempoPoint[];
	speed: number;
};

/** Every note onset of one pass, in playback order (ties and dead notes have no onset). */
export function buildTimeline(lookup: TickLookupLike, opts: TimelineOptions = {}): Timeline {
	const speed = opts.speed ?? 1;
	const map = tempoMap(lookup, opts.fallbackTempo);
	const notes: ExpectedNote[] = [];
	let endTick = 0;
	for (const mb of lookup.masterBars) {
		endTick = Math.max(endTick, mb.end);
		const seen = new Set<unknown>();
		for (let b = mb.firstBeat; b; b = b.nextBeat)
			for (const { beat, playbackStart } of b.highlightedBeats) {
				if (seen.has(beat) || !onTrack(beat, opts)) continue;
				seen.add(beat);
				if (beat.isRest) continue;
				const tick = mb.start + playbackStart;
				const strings = beat.voice?.bar?.staff?.tuning?.length ?? 6;
				const sounding = beat.notes.filter(
					(n) => !n.isTieDestination && !n.isDead && !n.isPercussion
				);
				// Low to high, so `index` reads like a chord diagram.
				sounding
					.sort((a, b) => a.realValue - b.realValue)
					.forEach((n, index) =>
						notes.push({
							t: tickToMs(tick, map, speed),
							tick,
							midi: n.realValue,
							string: strings - n.string + 1,
							fret: n.fret,
							bar: mb.masterBar?.index ?? 0,
							soft: !!n.isHammerPullDestination || !!n.slideOrigin,
							index,
							ref: n
						})
					);
			}
	}
	notes.sort((a, b) => a.tick - b.tick || a.index - b.index);
	return { notes, duration: tickToMs(endTick, map, speed), endTick, map, speed };
}

function onTrack(beat: BeatLike, opts: TimelineOptions) {
	const staff = beat.voice?.bar?.staff;
	if (!staff) return true;
	return (
		(staff.track?.index ?? 0) === (opts.track ?? 0) && (staff.index ?? 0) === (opts.staff ?? 0)
	);
}

/** alphaTab's count-in: one bar of the first bar's metre at the opening tempo. */
export function countInMs(barTicks: number, map: readonly TempoPoint[], speed = 1): number {
	return (barTicks * 60000) / (QUARTER_TICKS * map[0].tempo) / speed;
}

/**
 * The timeline as it sounds from pressing Play along: an optional count-in, then `passes` loops of
 * the piece back to back (the player repeats without a gap).
 */
export function unroll(
	tl: Timeline,
	{ countIn = 0, passes = 1 }: { countIn?: number; passes?: number } = {}
): (ExpectedNote & { pass: number })[] {
	const out: (ExpectedNote & { pass: number })[] = [];
	for (let pass = 0; pass < passes; pass++)
		for (const n of tl.notes) out.push({ ...n, t: countIn + pass * tl.duration + n.t, pass });
	return out;
}

// ---- monophonic detection -------------------------------------------------------------------

/**
 * Note checking hears one note at a time: an exercise is listenable when no two notes start
 * together (chords, a bass under a melody). The exercise's `listen` flag overrides.
 */
export function isMonophonic(tl: Pick<Timeline, 'notes'>): boolean {
	if (!tl.notes.length) return false;
	for (let i = 1; i < tl.notes.length; i++)
		if (tl.notes[i].tick === tl.notes[i - 1].tick) return false;
	return true;
}

export function listenable(meta: { listen?: boolean }, tl: Pick<Timeline, 'notes'>): boolean {
	return meta.listen ?? isMonophonic(tl);
}

/** Strum windows: the beats where 3+ notes start together, with their pitch classes (chord check). */
export function strumWindows(tl: Pick<Timeline, 'notes'>) {
	const out: { t: number; tick: number; bar: number; pcs: number[] }[] = [];
	let i = 0;
	while (i < tl.notes.length) {
		let j = i;
		while (j < tl.notes.length && tl.notes[j].tick === tl.notes[i].tick) j++;
		if (j - i >= 3) {
			const group = tl.notes.slice(i, j);
			out.push({
				t: group[0].t,
				tick: group[0].tick,
				bar: group[0].bar,
				pcs: [...new Set(group.map((n) => ((n.midi % 12) + 12) % 12))].sort((a, b) => a - b)
			});
		}
		i = j;
	}
	return out;
}
