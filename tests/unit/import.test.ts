import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkAlphaTex } from '../../src/lib/content/alphatex';
import { importProblems } from '../../src/lib/content/imported';
import { AUTO_ARRANGER, type SongMeta } from '../../src/lib/content/schema';
import {
	fingerNotes,
	fretCap,
	noteCap,
	octaveShift,
	shift,
	type NoteEvent
} from '../../src/lib/import/fingering';
import { importScore, loadScore } from '../../src/lib/import/score';

/** A melody: one note per beat (pitches as MIDI numbers). */
const melody = (pitches: number[]): NoteEvent[] =>
	pitches.map((pitch, i) => ({ id: i, start: i, end: i + 1, pitch }));
/** "fret.string" (alphaTex: 6 = low E) for each note. */
const tab = (events: NoteEvent[], level: number) => {
	const r = fingerNotes(events, { maxFret: fretCap(level), maxNotes: noteCap(level) });
	return events.map((e) => {
		const p = r.positions.get(e.id);
		return p ? `${p.fret}.${6 - p.string}` : 'x';
	});
};

describe('fingering (Viterbi)', () => {
	it('caps frets by level: first position up to Level 3, 7 at Level 4, 12 from Level 5', () => {
		expect([0, 1, 3, 4, 5, 9].map(fretCap)).toEqual([5, 5, 5, 7, 12, 12]);
		expect([1, 4, 5].map(noteCap)).toEqual([4, 4, 6]);
	});

	it('plays a C major scale in first position, open strings where they are', () => {
		// C3 D3 E3 F3 G3 A3 B3 C4
		expect(tab(melody([48, 50, 52, 53, 55, 57, 59, 60]), 1)).toEqual([
			'3.5',
			'0.4',
			'2.4',
			'3.4',
			'0.3',
			'2.3',
			'0.2',
			'1.2'
		]);
	});

	it('plays "Ode to Joy" (E E F G G F E D C C D E) on the top strings', () => {
		expect(tab(melody([64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64]), 1)).toEqual([
			'0.1',
			'0.1',
			'1.1',
			'3.1',
			'3.1',
			'1.1',
			'0.1',
			'3.2',
			'1.2',
			'1.2',
			'3.2',
			'0.1'
		]);
	});

	it('flags notes above the cap (and still places them), but not at a level that allows them', () => {
		const high = melody([64, 69, 72]); // E4 A4 C5: A4 and C5 sit at frets 5 and 8 of the high e
		const low = fingerNotes(high, { maxFret: fretCap(1) });
		expect(low.flagged.map((f) => f.reason)).toEqual([
			expect.stringMatching(/fret 8 is above the cap \(5\)/)
		]);
		expect(low.positions.get(2)).toEqual({ string: 5, fret: 8 });
		expect(fingerNotes(high, { maxFret: fretCap(5) }).flagged).toEqual([]);
	});

	it('keeps a held bass on its string while the melody moves over it', () => {
		// C3 held for 4 beats under E4 D4 C4 D4.
		const events: NoteEvent[] = [
			{ id: 0, start: 0, end: 4, pitch: 48 },
			...melody([64, 62, 60, 62]).map((e) => ({ ...e, id: e.id + 1 }))
		];
		const r = fingerNotes(events, { maxFret: 5 });
		expect(r.positions.get(0)).toEqual({ string: 1, fret: 3 });
		for (let i = 1; i <= 4; i++) expect(r.positions.get(i)!.string).not.toBe(1);
		expect(r.flagged).toEqual([]);
	});

	it('thins chords to four notes below Level 5 (bass and melody stay)', () => {
		// An open E major chord struck at once: E2 B2 E3 G#3 B3 E4.
		const chord = [40, 47, 52, 56, 59, 64].map((pitch, id) => ({ id, start: 0, end: 1, pitch }));
		const r = fingerNotes(chord, { maxFret: 5, maxNotes: 4 });
		expect(r.dropped).toHaveLength(2);
		expect(r.positions.get(0)).toBeDefined(); // bass
		expect(r.positions.get(5)).toBeDefined(); // melody
		expect(fingerNotes(chord, { maxFret: 5, maxNotes: 6 }).dropped).toEqual([]);
	});

	it('moves the hand only when a shape does not fit the current position', () => {
		expect(shift([3, 0], [1])).toBe(0); // fret 1 and fret 3: both in first position
		expect(shift([1], [7])).toBe(3); // fret 7 needs the hand at 4 or above (from 1)
	});

	it('finds the guitar octave of a score (written-pitch MIDI files sound an octave lower)', () => {
		expect(octaveShift([55, 60, 72, 79], 5)).toBe(-12);
		expect(octaveShift([40, 52, 64, 76], 12)).toBe(0);
		expect(octaveShift([28, 40], 5)).toBe(12);
	});
});

describe('importer (MusicXML fixture → tab)', () => {
	const fixture = path.resolve(__dirname, '../fixtures/import/two-voices.musicxml');

	it('fingers both voices and writes compact alphaTex that matches the exporter', () => {
		const score = loadScore(new Uint8Array(fs.readFileSync(fixture)));
		const { tex, report } = importScore(score, {
			level: 1,
			title: 'Fixture',
			composer: 'Trad.',
			tempo: 80,
			comment: ['Test']
		});
		expect(report.problems).toEqual([]);
		expect(checkAlphaTex(tex)).toEqual([]);
		expect(tex).toContain('\\ts (4 4) :4 0.1 3.2 1.2 3.2 |');
		expect(tex).toContain('\\voice\n:1 3.5 |\n3.5');
		expect(report).toMatchObject({
			shift: 0,
			maxFret: 5,
			highest: 3,
			dropped: 0,
			bars: 2,
			flagged: []
		});
	});

	it('content:check rules: fret cap, notes at once, strings, licence', () => {
		const meta: SongMeta = {
			id: 'x',
			title: 'X',
			composer: 'Y',
			arranger: AUTO_ARRANGER,
			level: 1,
			style: 'classical',
			key: 'C major',
			source: 'Mutopia',
			sourceUrl: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1',
			license: 'CC BY-SA 4.0 (Mutopia edition); tablature CC BY-SA 4.0',
			attribution: 'Y - X.',
			play: 'fingerstyle',
			import: {
				via: 'mutopia',
				file: 'https://x/y.mid',
				sha256: 'a'.repeat(64),
				composerDied: 1839
			}
		};
		const head =
			'\\tempo 80\n\\track ("Guitar" "Gtr.") { instrument acousticguitarnylon }\n\\staff { score tabs }\n\\ts (4 4)\n';
		expect(importProblems(meta, head + ':4 0.1 3.2 1.2 3.2', 2026)).toEqual([]);
		const problems = importProblems(meta, head + ':4 7.1 (0.6 0.5 0.4 0.3 0.2) r r', 2026);
		expect(problems.join('\n')).toMatch(/above fret 5/);
		expect(problems.join('\n')).toMatch(/more than 4 notes at once/);
		const pitched = head.replace('{ score tabs }', '{ score }') + ':4 C4 D4 E4 F4';
		expect(importProblems(meta, pitched, 2026).join()).toMatch(/without a string/);
		expect(
			importProblems({ ...meta, license: 'All rights reserved' }, head + ':1 0.1', 2026).join()
		).toMatch(/license must start/);
		expect(
			importProblems({ ...meta, license: 'CC BY-SA 3.0; tab CC0' }, head + ':1 0.1', 2026).join()
		).toMatch(/cannot be relicensed CC0/);
		expect(
			importProblems(
				{ ...meta, import: { ...meta.import!, composerDied: 1980 } },
				head + ':1 0.1',
				2026
			).join()
		).toMatch(/not public domain/);
	});
});
