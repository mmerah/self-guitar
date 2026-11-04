// M6 content gaps: the extended chord library (maj7, m7b5, dim, dim7, 6, 9, 6/9, m9, maj9, 11, m11,
// 13) and its name parser, picking a voicing with "Name@voicing-id", 16th-note strum patterns and
// exercises in alternate tunings.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	canonicalChordRef,
	checkVoicing,
	chordName,
	chordRef,
	chordRefProblem,
	CHORDS,
	getChord,
	parseChordName,
	parseQuality,
	splitChordRef
} from '../../src/lib/chords';
import { strumMeterMismatch, strumMismatches } from '../../src/lib/content/alphatex';
import { loadLearn } from '../../src/lib/content/learn';
import { resolveChord } from '../../src/lib/sheet/chords';
import { parseLesson } from '../../src/lib/learn/markdown';
import {
	formatStrum,
	parseStrum,
	strumCount,
	strumMeter,
	strumMeterProblem,
	strumSlotAt,
	strumSlotInBar,
	type Strum
} from '../../src/lib/learn/strum';
import { toolHref, toolPreset } from '../../src/lib/learn/tools';
import { altTuning, scoreTuning, scoreTuningNotes } from '../../src/lib/learn/tuning';

/** Chord name → the voicing ids the M6 authors asked for (frets low to high). */
const ADDED: Record<string, string[]> = {
	Gmaj7: ['3-2-0-0-0-2'],
	Cmaj7: ['x-3-2-0-0-0', 'x-3-5-4-5-x', 'x-3-2-4-x-x'],
	Amaj7: ['x-0-2-1-2-0'],
	Dmaj7: ['x-x-0-2-2-2'],
	Bbmaj7: ['x-1-0-2-x-x'],
	Cm7b5: ['x-3-4-3-4-x'],
	Bm7b5: ['x-2-3-2-3-x'],
	Ebdim7: ['x-x-1-2-1-2'],
	C6: ['x-3-2-2-1-0'],
	C9: ['x-3-2-3-3-3'],
	'C6/9': ['x-3-2-2-3-3'],
	Am11: ['x-0-0-0-1-0'],
	G13: ['3-x-3-4-5-x'],
	Dm9: ['x-5-3-5-5-x'],
	Cmaj9: ['x-3-2-4-3-x'],
	Dm7: ['x-x-0-2-1-1']
};

describe('extended chord library', () => {
	it.each(Object.entries(ADDED))('%s has the requested voicings, spelled right', (name, ids) => {
		const chord = getChord(name)!;
		expect(chord, name).toBeDefined();
		for (const id of ids) {
			const v = chord.voicings.find((x) => x.id === id);
			expect(v, `${name} ${id}`).toBeDefined();
			expect(checkVoicing(chord, v!)).toEqual([]);
		}
	});

	it('has movable maj7, m7b5, dim7 and dim shapes in every key', () => {
		for (const q of ['maj7', 'm7b5', 'dim7', 'dim'])
			for (const root of ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']) {
				const c = getChord(root + q);
				expect(c, root + q).toBeDefined();
				for (const v of c!.voicings) expect(checkVoicing(c!, v), `${c!.id} ${v.id}`).toEqual([]);
			}
		// A-shape maj7 barre and the E-shape maj7 (1-x-2-2-1-x is Fmaj7).
		expect(getChord('Bbmaj7')!.voicings.map((v) => v.id)).toContain('x-1-3-2-3-1');
		expect(getChord('Fmaj7')!.voicings.map((v) => v.id)).toContain('1-x-2-2-1-x');
		// m7b5 root 6, and a shape reaching below the root fret lands on an open string.
		expect(getChord('Gm7b5')!.voicings[0].id).toBe('3-x-3-3-2-x');
		const fm7b5 = getChord('Fm7b5')!.voicings[0];
		expect(fm7b5).toMatchObject({ id: '1-x-1-1-0-x', fingers: [2, 0, 3, 4, 0, 0] });
		expect(getChord('Bdim')!.voicings[0].id).toBe('x-2-3-4-3-x');
		// Open Dm7 comes before the barre forms.
		expect(getChord('Dm7')!.voicings[0]).toMatchObject({ id: 'x-x-0-2-1-1', kind: 'open' });
		// Closed curated forms sort with the movable shapes (not shown as "Open").
		expect(getChord('Cm7b5')!.voicings.every((v) => v.kind === 'barre')).toBe(true);
	});

	it('rejects a misspelled extension', () => {
		const c9 = getChord('C9')!;
		// x-3-2-0-3-3: no B♭, so not a dominant 9.
		const v = { ...c9.voicings[0], frets: [null, 3, 2, 0, 3, 3] };
		expect(checkVoicing(c9, v).join()).toMatch(/missing chord tone \+10/);
	});

	it('parses aliases for every new quality', () => {
		const cases: [string, string][] = [
			['CM7', 'Cmaj7'],
			['CΔ', 'Cmaj7'],
			['Cmaj7', 'Cmaj7'],
			['Bø', 'Bm7b5'],
			['Bø7', 'Bm7b5'],
			['Bm7-5', 'Bm7b5'],
			['Bmin7b5', 'Bm7b5'],
			['Cdim', 'Cdim'],
			['C°', 'Cdim'],
			['C°7', 'Cdim7'],
			['Co7', 'Cdim7'],
			['C6', 'C6'],
			['C9', 'C9'],
			['C69', 'C6/9'],
			['C6/9', 'C6/9'],
			['Dmin9', 'Dm9'],
			['D-9', 'Dm9'],
			['CM9', 'Cmaj9'],
			['C11', 'C11'],
			['Amin11', 'Am11'],
			['G13', 'G13'],
			['B♭maj7', 'Bbmaj7'],
			['A#maj7', 'Bbmaj7']
		];
		for (const [name, id] of cases) expect(getChord(name)?.id, name).toBe(id);
		expect(parseQuality('ø')).toBe('m7b5');
		expect(parseQuality('nope')).toBeNull();
		expect(parseChordName('Q7')).toBeNull();
		// Slugs stay URL-safe and win over aliases ("g-7" is G7, not G minor 7).
		expect(getChord('c-6-9')?.id).toBe('C6/9');
		expect(getChord('b-m7b5')?.id).toBe('Bm7b5');
		expect(getChord('g-7')?.id).toBe('G7');
		for (const c of CHORDS) expect(c.slug).toMatch(/^[a-z0-9-]+$/);
		expect(chordName(getChord('Bm7b5')!)).toBe('B half-diminished');
		// Chord sheets: "C6/9" is a chord, "C6/G" a slash chord.
		expect(resolveChord('C6/9')?.name).toBe('C6/9');
		expect(resolveChord('C6/G')?.name).toBe('C6/G');
	});
});

describe('voicing selector', () => {
	it('splits, resolves and canonicalises "Name@voicing-id"', () => {
		expect(splitChordRef('F@1-3-3-2-1-1')).toEqual({ name: 'F', voicing: '1-3-3-2-1-1' });
		expect(splitChordRef(' F ')).toEqual({ name: 'F' });
		expect(chordRef('F')!.voicing.label).toBe('Mini F');
		expect(chordRef('F@1-3-3-2-1-1')!.voicing).toMatchObject({
			frets: [1, 3, 3, 2, 1, 1],
			barre: { fret: 1, from: 0, to: 5 }
		});
		expect(chordRef('f@1-3-3-2-1-1')!.chord.id).toBe('F');
		expect(canonicalChordRef('Db@x-4-6-6-6-4')).toBe('C#@x-4-6-6-6-4');
		expect(canonicalChordRef('Db')).toBe('C#');
		expect(chordRef('F@9-9-9-9-9-9')).toBeUndefined();
		expect(chordRefProblem('F@9-9-9-9-9-9')).toMatch(/F has no voicing "9-9-9-9-9-9" \(has /);
		expect(chordRefProblem('Q@1')).toMatch(/unknown chord "Q"/);
		expect(chordRefProblem('Bm@x-2-4-4-3-2')).toBeNull();
	});

	it('works in ::chord, ::chords, ::strum and the changes tool', () => {
		const { blocks, problems } = parseLesson(
			[
				'::chord{id="F@1-3-3-2-1-1"}',
				'',
				'::chords{ids="C, f@1-3-3-2-1-1"}',
				'',
				'::strum{pattern="D - D U" bpm=60 chord="F@1-3-3-2-1-1"}',
				'',
				'::tool{name="changes" a="C" b="F@1-3-3-2-1-1"}'
			].join('\n')
		);
		expect(problems).toEqual([]);
		expect(blocks[0]).toEqual({ t: 'chord', id: 'F', voicing: '1-3-3-2-1-1' });
		expect(blocks[1]).toEqual({ t: 'chords', ids: ['C', 'F'], voicings: [null, '1-3-3-2-1-1'] });
		expect(blocks[2]).toMatchObject({ t: 'strum', chord: 'F@1-3-3-2-1-1' });
		const tool = blocks[3] as { params: Record<string, string> };
		expect(toolHref('changes', tool.params)).toBe('/tools/changes?a=C&b=F%401-3-3-2-1-1');
		expect(toolPreset('changes', tool.params)).toBe('C – F (E-shape barre)');
		// Without a voicing: the plain chord, no voicings array.
		expect(parseLesson('::chords{ids="C,G"}').blocks[0]).toEqual({ t: 'chords', ids: ['C', 'G'] });
	});

	it('reports bad voicings with their line', () => {
		const msgs = (src: string) =>
			parseLesson(src)
				.problems.map((p) => p.message)
				.join(' | ');
		expect(msgs('::chord{id="F@1-1-1-1-1-1"}')).toMatch(/F has no voicing "1-1-1-1-1-1"/);
		expect(msgs('::chord{id="F@1-3-3-2-1-1" voicing="1-3-3-2-1-1"}')).toMatch(/voicing once/);
		expect(msgs('::chords{ids="C,F@0"}')).toMatch(/no voicing "0"/);
		expect(msgs('::tool{name="changes" a="C" b="C@x-3-5-5-5-3"}')).toMatch(/two different/);
		expect(msgs('::tool{name="changes" a="C" b="G@1"}')).toMatch(/G has no voicing "1"/);
	});
});

describe('16th-note strums', () => {
	it('parses beat groups and sub=16', () => {
		const p = parseStrum('D-DU DUDU D-DU DUDU') as Strum;
		expect(p.sub).toBe(16);
		expect(p.slots.join('')).toBe('D-DUDUDUD-DUDUDU');
		expect(parseStrum('DU DU DU DU')).toEqual({ slots: 'DUDUDUDU'.split(''), sub: 8 });
		expect(parseStrum('D - D U - U D U D - D U - U D U', 16)).toMatchObject({ sub: 16 });
		// The same 16 single slots without sub=16: two bars of 8ths.
		expect(parseStrum('D - D U - U D U D - D U - U D U')).toMatchObject({ sub: 8 });
		expect(formatStrum(p)).toBe('D-DU DUDU D-DU DUDU');
		const err = (src: string, sub?: 16) => (parseStrum(src, sub) as { error: string }).error;
		expect(err('D-DU D')).toMatch(/mixes slots and beat groups/);
		expect(err('D-D D-D')).toMatch(/3 slots; a beat is 2 \(8ths\) or 4 \(16ths\)/);
		expect(err('DU DU', 16)).toMatch(/8ths, but sub=16/);
		expect(err('D-DU D-DU D-DU D-DU D-DU')).toMatch(/20 slots; use 8, 12, 16, 24, 32/);
		expect(err('D-DX')).toMatch(/must be D, U or -/);
	});

	it('counts "1 e & a" and maps clicks and the playhead to slots', () => {
		expect(Array.from({ length: 8 }, (_, i) => strumCount(i, 8, 16)).join(' ')).toBe(
			'1 e & a 2 e & a'
		);
		expect(Array.from({ length: 4 }, (_, i) => strumCount(i, 8)).join(' ')).toBe('1 & 2 &');
		expect(strumMeter(16, 16)).toEqual({ beats: 4, timeSignature: '4/4' });
		expect(strumMeter(12, 16).timeSignature).toBe('3/4');
		expect(strumMeter(8, 16).timeSignature).toBe('2/4');
		expect(strumMeter(32, 16).timeSignature).toBe('4/4');
		expect(strumSlotAt({ bar: 0, beat: 1, sub: 3 }, 16, 16)).toBe(7);
		expect(strumSlotAt({ bar: 1, beat: 0, sub: 2 }, 32, 16)).toBe(18);
		expect(strumSlotInBar({ length: 16, sub: 16 }, 4, 0, 0.5)).toBe(8);
		expect(strumSlotInBar({ length: 32, sub: 16 }, 4, 1, 0.99)).toBe(31);
		expect(strumSlotInBar({ length: 8 }, 4, 0, 0.5)).toBe(4);
		expect(strumSlotInBar({ length: 16, sub: 16 }, 4, -1, 0)).toBe(-1);
	});

	it('checks the pattern length against the time signature', () => {
		const p16 = parseStrum('D-DU DUDU D-DU DUDU') as Strum;
		expect(strumMeterProblem(p16, 4)).toBeNull();
		expect(strumMeterProblem(p16, 2)).toBeNull(); // two bars of 2/4
		expect(strumMeterProblem(p16, 3)).toMatch(/3\/4 needs 12 \(one bar\) or 24/);
		expect(strumMeterProblem(parseStrum('D - U D - U') as Strum, 6, 8)).toBeNull();
		const bar16 = (t: string) => `\\tempo 60\n\\ts (${t})\n:16 ` + '0.6 '.repeat(16);
		expect(strumMeterMismatch(bar16('4 4'), parseStrum('DUDU DUDU DUDU DUDU') as Strum)).toBeNull();
		expect(strumMeterMismatch(bar16('4 4'), parseStrum('DUDU DUDU DUDU') as Strum)).toMatch(
			/4\/4 needs 16/
		);
		expect(strumMeterMismatch(bar16('4 4'), 'D - D - D -'.split(' '))).toMatch(/4\/4 needs 8/);
	});

	it('compares 16th strums with the score, ties as misses', () => {
		const tex =
			'\\tempo 60\n\\ts (2 4)\n:8 (0.6 0.1) :16 (0.6 0.1) (0.1) :8 (0.6 0.1) :16 (0.6 0.1) (0.1)';
		expect(strumMismatches(tex, parseStrum('D-DU D-DU') as Strum)).toEqual([]);
		expect(strumMismatches(tex, parseStrum('D--U D--U') as Strum)).toEqual([1]);
		// A push: the last up-strum rings into bar 2 (tied), so bar 2 starts with a miss.
		const push =
			'\\tempo 60\n\\ts (2 4)\n:8 (0.6 0.1) :16 (0.6 0.1) (0.1) :8 (0.6 0.1) :16 (0.6 0.1) (1.1) |' +
			' :8 (-.1) :16 (1.6 1.1) (1.1) :8 (1.6 1.1) :16 (1.6 1.1) (1.1)';
		expect(strumMismatches(push, parseStrum('D-DU D-DU --DU D-DU') as Strum)).toEqual([]);
		expect(strumMismatches(push, parseStrum('D-DU D-DU') as Strum)).toEqual([2]);
	});

	it('compiles ::strum with 16ths', () => {
		const { blocks, problems } = parseLesson('::strum{pattern="D-DU DUDU D-DU DUDU" bpm=60}');
		expect(problems).toEqual([]);
		expect(blocks[0]).toMatchObject({ t: 'strum', sub: 16, bpm: 60 });
		expect((blocks[0] as { pattern: string[] }).pattern).toHaveLength(16);
		expect(parseLesson('::strum{pattern="D - D U" bpm=60}').blocks[0]).not.toHaveProperty('sub');
		const bad = parseLesson('::strum{pattern="D - D U" bpm=60 sub=32}').problems[0].message;
		expect(bad).toMatch(/sub must be 8/);
	});
});

describe('alternate tunings in exercises', () => {
	it('matches a score \\tuning to the tuner presets', () => {
		const dadgad = '\\tempo 60\n\\tuning (D4 A3 G3 D3 A2 D2)\n:4 0.6';
		expect(scoreTuningNotes(dadgad)).toEqual(['D2', 'A2', 'D3', 'G3', 'A3', 'D4']);
		expect(altTuning(dadgad)?.id).toBe('dadgad');
		expect(altTuning('\\tempo 60\n\\tuning (D4 B3 G3 D3 G2 D2)\n:4 0.6')?.name).toBe('Open G');
		expect(altTuning('\\tempo 60\n\\tuning D4 A3 F#3 D3 A2 D2\n:4 0.6')?.id).toBe('open-d');
		expect(altTuning('\\tempo 60\n:4 0.6')).toBeNull();
		expect(scoreTuning('\\tempo 60\n:4 0.6')).toMatchObject({ id: 'standard' });
		expect(scoreTuning('\\tempo 60\n\\tuning (E4 C4 G3 D3 G2 C2)\n:4 0.6')).toBe('unknown');
		// A comment mentioning \tuning is not one.
		expect(altTuning('// \\tuning (D4 A3 G3 D3 A2 D2)\n\\tempo 60\n:4 0.6')).toBeNull();
	});

	it('content:check accepts preset tunings and rejects others', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-tuning-'));
		const levels = [
			{
				id: 0,
				title: 'L0',
				goal: 'g',
				units: [{ id: 'u0', title: 'U', skills: [{ id: 's1', name: 'S', description: 'd' }] }]
			}
		];
		const write = (id: string, tuning: string) => {
			fs.mkdirSync(path.join(dir, 'exercises', id), { recursive: true });
			fs.writeFileSync(
				path.join(dir, 'exercises', id, 'meta.json'),
				JSON.stringify({
					id,
					title: 'Tuned',
					skills: ['s1'],
					howTo: ['Play it.'],
					startBpm: 60,
					targetBpm: 80
				})
			);
			fs.writeFileSync(
				path.join(dir, 'exercises', id, 'score.atex'),
				`\\tempo 80\n\\tuning (${tuning})\n:4 0.6 0.6 0.6 0.6`
			);
		};
		write('dadgad', 'D4 A3 G3 D3 A2 D2');
		write('odd', 'E4 C4 G3 D3 G2 C2');
		const all = loadLearn(dir, levels).errors.join('\n');
		expect(all).not.toMatch(/exercises\/dadgad/);
		expect(all).toMatch(
			/exercises\/odd\/score.atex: \\tuning \(C2 G2 D3 G3 C4 E4.*not a tuner preset/
		);
	});

	it('the L7 exercises set the tunings the tuner has', () => {
		const tex = (id: string) =>
			fs.readFileSync(path.join('content/exercises', id, 'score.atex'), 'utf8');
		expect(altTuning(tex('dadgad-drone'))?.id).toBe('dadgad');
		expect(altTuning(tex('open-d-barres'))?.id).toBe('open-d');
		expect(altTuning(tex('open-g-slide'))?.id).toBe('open-g');
	});
});
