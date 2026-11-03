// Node-only import pipeline (scripts/import): a MusicXML/MXL score → alphaTab's model → auto-fingered
// tab (fingering.ts) → compact house-style alphaTex, checked against alphaTab's own AlphaTexExporter
// (both must load to the same notes). Never runs downloaded code: the score is parsed as data.
import * as alphaTab from '@coderline/alphatab';
import { checkAlphaTex } from '../content/alphatex.ts';
import {
	fingerNotes,
	fretCap,
	noteCap,
	octaveShift,
	STANDARD_TUNING,
	type NoteEvent
} from './fingering.ts';

type Score = alphaTab.model.Score;
type Note = alphaTab.model.Note;
type Beat = alphaTab.model.Beat;

/** Loads MusicXML (.musicxml/.xml), compressed MusicXML (.mxl) or Guitar Pro bytes. */
export function loadScore(bytes: Uint8Array): Score {
	return alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, new alphaTab.Settings());
}

const pitchOf = (n: Note) => (n.isStringed && n.string > 0 ? n.realValue : n.octave * 12 + n.tone);

/** Voices that hold notes, over every track and staff (a MIDI file may split the parts). */
function staves(score: Score) {
	return score.tracks
		.flatMap((t) => t.staves)
		.filter((s) => s.bars.some((b) => b.voices.some((v) => !v.isEmpty)));
}

type Collected = { events: NoteEvent[]; notes: Map<number, Note[]> };

/** Every sounding note as an event (tied continuations join the note they continue). */
export function collectEvents(score: Score, shift = 0): Collected {
	const events: NoteEvent[] = [];
	const notes = new Map<number, Note[]>();
	const byNote = new Map<Note, NoteEvent>();
	let id = 0;
	for (const staff of staves(score))
		for (const bar of staff.bars)
			for (const voice of bar.voices)
				for (const beat of voice.beats) {
					const start = bar.masterBar.start + beat.playbackStart;
					const end = start + beat.playbackDuration;
					for (const n of beat.notes) {
						const origin = n.isTieDestination ? n.tieOrigin : null;
						const ev = origin ? byNote.get(origin) : undefined;
						if (ev) {
							ev.end = Math.max(ev.end, end);
							byNote.set(n, ev);
							notes.get(ev.id)!.push(n);
							continue;
						}
						const e: NoteEvent = { id: id++, start, end, pitch: pitchOf(n) + shift };
						events.push(e);
						byNote.set(n, e);
						notes.set(e.id, [n]);
					}
				}
	return { events, notes };
}

export type FingerReport = {
	shift: number;
	maxFret: number;
	onsets: number;
	dropped: number;
	highest: number;
	flagged: { bar: number; reason: string }[];
};

/** Turns every note into a tab note (string + fret) for `level`; returns what needs review. */
export function fingerScore(
	score: Score,
	level: number,
	opts: { shift?: number } = {}
): FingerReport {
	const maxFret = fretCap(level);
	const raw = collectEvents(score);
	const shift =
		opts.shift ??
		octaveShift(
			raw.events.map((e) => e.pitch),
			maxFret
		);
	const { events, notes } = collectEvents(score, shift);
	const result = fingerNotes(events, { maxFret, maxNotes: noteCap(level) });
	const dropped = new Set(result.dropped);
	for (const e of events) {
		for (const n of notes.get(e.id)!) {
			if (dropped.has(e.id)) {
				n.beat.removeNote(n);
				continue;
			}
			const p = result.positions.get(e.id)!;
			n.string = p.string + 1; // the model counts 1 = low E
			n.fret = p.fret;
			n.octave = -1;
			n.tone = -1;
		}
	}
	for (const staff of staves(score)) {
		staff.stringTuning = new alphaTab.model.Tuning(
			'Standard',
			[...STANDARD_TUNING].reverse(),
			true
		);
		staff.showTablature = true;
		staff.showStandardNotation = true;
	}
	const barOf = (t: number) => {
		let i = 0;
		for (const mb of score.masterBars) if (mb.start <= t) i = mb.index;
		return i + 1;
	};
	const flagged = result.flagged.map((f) => ({ bar: barOf(f.time), reason: f.reason }));
	return {
		shift,
		maxFret,
		onsets: new Set(events.map((e) => e.start)).size,
		dropped: dropped.size,
		highest: Math.max(0, ...[...result.positions.values()].map((p) => p.fret)),
		flagged: flagged.filter(
			(f, i) => i === 0 || f.bar !== flagged[i - 1].bar || f.reason !== flagged[i - 1].reason
		)
	};
}

// ---- house-style alphaTex ------------------------------------------------------------------------

const DURATION: Record<number, string> = {
	[-4]: ':1',
	[-2]: ':1',
	1: ':1',
	2: ':2',
	4: ':4',
	8: ':8',
	16: ':16',
	32: ':32',
	64: ':64'
};
const q = (s: string) => `"${s.replace(/"/g, "'")}"`;

function beatText(beat: Beat, state: { dur: string }) {
	const dur = DURATION[beat.duration] ?? ':4';
	const fx: string[] = [];
	if (beat.dots === 1) fx.push('d');
	if (beat.dots >= 2) fx.push('dd');
	if (beat.hasTuplet)
		fx.push(
			beat.tupletNumerator === 3 && beat.tupletDenominator === 2
				? 'tu 3'
				: `tu (${beat.tupletNumerator} ${beat.tupletDenominator})`
		);
	const notes = [...beat.notes].sort((a, b) => b.string - a.string);
	const one = (n: Note) => `${n.fret}.${7 - n.string}${n.isTieDestination ? '{t}' : ''}`;
	const body =
		beat.isRest || !notes.length
			? 'r'
			: notes.length === 1 && !notes[0].isTieDestination
				? one(notes[0])
				: `(${notes.map(one).join(' ')})`;
	const out = `${dur === state.dur ? '' : `${dur} `}${body}${fx.length ? `{${fx.join(' ')}}` : ''}`;
	state.dur = dur;
	return out;
}

const KEYS = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];

/** Rests that fill a bar of `ticks` (960 per quarter). */
function restBar(ticks: number, state: { dur: string }): string {
	const parts: string[] = [];
	const values: [number, string, string][] = [
		[3840, ':1', ''],
		[2880, ':2', '{d}'],
		[1920, ':2', ''],
		[1440, ':4', '{d}'],
		[960, ':4', ''],
		[720, ':8', '{d}'],
		[480, ':8', ''],
		[240, ':16', '']
	];
	let left = ticks;
	while (left >= 240) {
		const [t, d, fx] = values.find(([t]) => t <= left)!;
		parts.push(`${d === state.dur ? '' : `${d} `}r${fx}`);
		state.dur = d;
		left -= t;
	}
	return parts.join(' ');
}

/** The score as compact alphaTex: one line per bar, a `\voice` per part when there are several. */
export function emitTex(
	score: Score,
	head: { title: string; composer: string; tempo: number; comment: string[] }
): string {
	const sts = staves(score);
	const voices: { staff: number; voice: number }[] = [];
	sts.forEach((st, si) => {
		const n = Math.max(...st.bars.map((b) => b.voices.length));
		for (let v = 0; v < n; v++)
			if (
				st.bars.some(
					(b) =>
						b.voices[v] && !b.voices[v].isEmpty && b.voices[v].beats.some((x) => x.notes.length)
				)
			)
				voices.push({ staff: si, voice: v });
	});
	const out = [
		...head.comment.map((c) => `// ${c}`),
		`\\title ${q(head.title)}`,
		`\\music ${q(head.composer)}`,
		`\\tempo ${head.tempo}`,
		'\\track ("Guitar" "Gtr.") { instrument acousticguitarnylon }',
		'\\staff { score tabs }'
	];
	voices.forEach(({ staff, voice }, vi) => {
		if (voices.length > 1) out.push('\\voice');
		const state = { dur: '' };
		let ts = '';
		let ks = 'C';
		sts[staff].bars.forEach((bar, bi) => {
			const mb = bar.masterBar;
			const meta: string[] = [];
			if (vi === 0) {
				const t = `${mb.timeSignatureNumerator} ${mb.timeSignatureDenominator}`;
				if (t !== ts) meta.push(`\\ts (${t})`);
				ts = t;
				const k = KEYS[(mb.keySignature as number) + 7] ?? 'C';
				if (k !== ks || bi === 0) {
					if (k !== 'C' || bi > 0) meta.push(`\\ks ${k}`);
				}
				ks = k;
			}
			const v = bar.voices[voice];
			// A second voice with nothing to play in a bar stays empty: filler rests clutter the tab.
			const silent = !v || v.isEmpty || v.beats.every((b) => !b.notes.length);
			const beats =
				!silent || vi === 0
					? v && !v.isEmpty
						? v.beats.map((b) => beatText(b, state)).join(' ')
						: restBar(mb.calculateDuration(), state)
					: '';
			const last = bi === sts[staff].bars.length - 1;
			out.push(`${meta.length ? meta.join(' ') + ' ' : ''}${beats}${last ? '' : ' |'}`);
		});
	});
	return out.join('\n') + '\n';
}

/** (bar, voice, start, string, fret, duration) of every note: two scores are equal when these are. */
export function noteSequence(score: Score): string[] {
	const out: string[] = [];
	for (const st of staves(score))
		for (const bar of st.bars)
			bar.voices.forEach((v, vi) => {
				for (const b of v.beats)
					for (const n of b.notes)
						out.push(
							[bar.index, vi, b.playbackStart, b.playbackDuration, n.string, n.fret].join(':')
						);
			});
	return out.sort();
}

/** Loads alphaTex into a score. */
export const loadTex = (tex: string) =>
	alphaTab.importer.ScoreLoader.loadAlphaTex(tex, new alphaTab.Settings());

/** alphaTab's own exporter (the oracle the compact form is compared with). */
export const exportTex = (score: Score) =>
	new alphaTab.exporter.AlphaTexExporter().exportToString(score, new alphaTab.Settings());

export type ImportResult = {
	tex: string;
	report: FingerReport & { bars: number; problems: string[] };
};

/**
 * The whole conversion: finger the score for `level`, emit house-style alphaTex, then check it
 * (alphaTab parses it, bars add up, and it holds the same notes as the exporter's output).
 */
export function importScore(
	score: Score,
	opts: {
		level: number;
		title: string;
		composer: string;
		tempo: number;
		comment: string[];
		shift?: number;
	}
): ImportResult {
	const report = fingerScore(score, opts.level, { shift: opts.shift });
	const tex = emitTex(score, opts);
	const problems = checkAlphaTex(tex);
	if (!problems.length) {
		const ours = noteSequence(loadTex(tex));
		const oracle = noteSequence(loadTex(exportTex(score)));
		if (ours.join() !== oracle.join())
			problems.push(
				`the compact alphaTex differs from AlphaTexExporter's (${ours.length} vs ${oracle.length} notes)`
			);
	}
	return { tex, report: { ...report, bars: score.masterBars.length, problems } };
}
