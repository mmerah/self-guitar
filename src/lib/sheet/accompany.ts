// A Sheet's strummed accompaniment as alphaTex: the chords of the grid, played with each block's
// strum pattern (D = all voiced strings, U = the top three, - = the previous strum rings on), with
// voicings from content/chords.ts. Chord names sit above every bar and every change. content:build writes it for playback; the sheet view generates
// it again when the reader transposes.
import { SLOTS, type Sheet, type TimeSig } from './chordpro.ts';
import { transposeChord, voicingFor } from './chords.ts';

/** Note values for a run of 8th-note slots, longest first (1 slot = an 8th). */
const NOTE: [number, string][] = [
	[8, ':1'],
	[6, ':2{d}'],
	[4, ':2'],
	[3, ':4{d}'],
	[2, ':4'],
	[1, ':8']
];

/** Splits a run of slots into note values ("rings for 5 slots" = a half + an 8th). */
export function noteValues(slots: number): string[] {
	const out: string[] = [];
	let left = slots;
	while (left > 0) {
		const [n, v] = NOTE.find(([n]) => n <= left)!;
		out.push(v);
		left -= n;
	}
	return out;
}

/** alphaTex notes of a voicing: all voiced strings (down) or the top three (up); `tie` holds them on. */
function chordNotes(name: string, up: boolean, pinned?: string, tie = false): string {
	const v = voicingFor(name, pinned);
	if (!v) throw new Error(`no voicing for ${name}`);
	const notes = v.voicing.frets.flatMap((f, i) =>
		f === null ? [] : [`${tie ? '-' : f}.${6 - i}`]
	);
	return `(${(up ? notes.slice(-3) : notes).join(' ')})`;
}

const q = (s: string) => `"${s.replace(/"/g, "'")}"`;

export type Strum = { chord: string | null; up: boolean; len: number };

/**
 * One bar's strums: each pattern slot that strikes (D/U) plays the chord of its cell, a "-" lets
 * the previous strum ring on. A chord change that lands on a "-" slot is struck there anyway (down
 * on a beat, up off it), so the chord that lights up is the chord that sounds.
 */
export function strumsOf(pattern: string[], cells: string[], time: TimeSig): Strum[] {
	const perCell = pattern.length / cells.length;
	const beat = time === '6/8' ? 3 : 2;
	const strums: Strum[] = [];
	pattern.forEach((p, i) => {
		const chord = cells[Math.floor(i / perCell)];
		const last = strums[strums.length - 1];
		if (p !== '-') strums.push({ chord, up: p === 'U', len: 1 });
		else if (!last)
			strums.push({ chord: null, up: false, len: 1 }); // a miss at the start of a bar
		else if (i % perCell === 0 && last.chord !== null && last.chord !== chord)
			strums.push({ chord, up: i % beat !== 0, len: 1 });
		else last.len++;
	});
	return strums;
}

/**
 * The accompaniment of a sheet, moved by `transpose` semitones (shapes and chord names), played
 * with the capo on `capo` (the sheet's own by default).
 */
export function accompaniment(sheet: Sheet, transpose = 0, capo = sheet.capo): string {
	const slots = SLOTS[sheet.time];
	const [num, den] = sheet.time.split('/');
	const name = (c: string) => transposeChord(c, transpose);
	const pin = (c: string) => (transpose ? undefined : sheet.voicings[c]);
	const out = [
		'// Generated from song.cho by content:build (src/lib/sheet/accompany.ts): do not edit.',
		`\\title ${q(sheet.title)}`,
		`\\tempo ${sheet.tempo}`,
		'\\track ("Guitar" "Gtr.") { instrument acousticguitarsteel }',
		`\\staff { tabs }${capo ? ` \\capo ${capo}` : ''}`,
		`\\ts (${num} ${den})${sheet.pickup ? ' \\ac' : ''}`
	];
	let lastBlock = -1;
	let barInBlock = 0;
	let prev: string | null = null;
	let dur = '';
	/** One beat: its note value (written only when it changes), notes and effects. */
	const beat = (value: string, notes: string, fx: string[]) => {
		const dot = value.endsWith('{d}');
		const d = value.replace('{d}', '');
		const all = [dot ? 'd' : '', ...fx].filter(Boolean);
		const out = `${d === dur ? '' : `${d} `}${notes}${all.length ? `{${all.join(' ')}}` : ''}`;
		dur = d;
		return out;
	};
	for (const bar of sheet.bars) {
		let pattern: string[];
		if (bar.p) {
			// The pickup: sung alone (rests), under the first section's name.
			const block = sheet.blocks[bar.b];
			if (block.type !== 'comment') out.push(`\\section ${q(block.label)}`);
			lastBlock = bar.b;
			out.push(
				noteValues(bar.p)
					.map((v) => beat(v, 'r', []))
					.join(' ') + ' |'
			);
			continue;
		} else if (bar.b === -1) {
			pattern = ['D', ...Array(slots - 1).fill('-')];
		} else {
			const block = sheet.blocks[bar.b];
			if (block.type === 'comment') continue;
			if (bar.b !== lastBlock) {
				out.push(`\\section ${q(block.label)}`);
				lastBlock = bar.b;
				barInBlock = 0;
			}
			const full = block.strum.split(' ');
			const offset = full.length > slots ? (barInBlock % 2) * slots : 0;
			pattern = full.slice(offset, offset + slots);
			barInBlock++;
		}
		const strums = strumsOf(pattern, bar.c, sheet.time);
		const parts: string[] = [];
		// Every bar names its chord (read as a tab, each bar says what to hold), then each change.
		prev = null;
		for (const s of strums) {
			noteValues(s.len).forEach((v, k) => {
				if (s.chord === null) return parts.push(beat(v, 'r', []));
				const c = name(s.chord);
				if (k > 0) return parts.push(beat(v, chordNotes(c, s.up, pin(s.chord), true), []));
				const fx = [s.up ? 'bu' : 'bd'];
				if (s.chord !== prev) fx.push(`ch ${q(c)}`);
				prev = s.chord;
				parts.push(beat(v, chordNotes(c, s.up, pin(s.chord)), fx));
			});
		}
		out.push(parts.join(' ') + ' |');
	}
	// No barline after the last bar.
	out[out.length - 1] = out[out.length - 1].replace(/ \|$/, '');
	return out.join('\n') + '\n';
}
