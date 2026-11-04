import { describe, expect, it } from 'vitest';
import {
	boxDots,
	cagedDots,
	cagedOrder,
	diatonic,
	dotLabel,
	enharmonic,
	fretboardParams,
	intervalBetween,
	keyUsesFlats,
	overlay,
	parseFretboard,
	pcOf,
	scaleNotes,
	simplify,
	spell,
	transposeNote,
	transposeSymbol,
	triadShapes
} from '../../src/lib/theory';
import { hitOf, makeRound, quizSpec, roundPassed, targets } from '../../src/lib/fretboard/quiz';

const pos = (dots: { string: number; fret: number }[]) => dots.map((d) => `${d.string}:${d.fret}`);

describe('spelling and intervals', () => {
	it('spells notes from the letters', () => {
		expect(spell('F', '4')).toBe('Bb');
		expect(spell('E', '3')).toBe('G#');
		expect(spell('A', 'b3')).toBe('C');
		expect(spell('Db', '5')).toBe('Ab');
		expect(spell('C', 'b5')).toBe('Gb');
		expect(spell('C', '#4')).toBe('F#');
		expect(spell('C', 'bb7')).toBe('Bbb');
	});
	it('scales are spelled in their key', () => {
		expect(scaleNotes('F', 'major')).toEqual(['F', 'G', 'A', 'Bb', 'C', 'D', 'E']);
		expect(scaleNotes('A', 'minor-pentatonic')).toEqual(['A', 'C', 'D', 'E', 'G']);
		expect(scaleNotes('E', 'blues')).toEqual(['E', 'G', 'A', 'Bb', 'B', 'D']);
		expect(scaleNotes('D', 'dorian')).toEqual(['D', 'E', 'F', 'G', 'A', 'B', 'C']);
		expect(scaleNotes('Eb', 'natural-minor')).toEqual(['Eb', 'F', 'Gb', 'Ab', 'Bb', 'Cb', 'Db']);
	});
	it('enharmonics, simplification, key accidentals', () => {
		expect(enharmonic('F#', 'Gb')).toBe(true);
		expect(enharmonic('E#', 'F')).toBe(true);
		expect(pcOf('B##')).toBe(1);
		expect(simplify('E#')).toBe('F');
		expect(simplify('Cb')).toBe('B');
		expect(simplify('Bbb')).toBe('A');
		expect(keyUsesFlats('F')).toBe(true);
		expect(keyUsesFlats('G')).toBe(false);
		expect(keyUsesFlats('D', true)).toBe(true);
		expect(keyUsesFlats('E', true)).toBe(false);
	});
	it('transposes notes and chord symbols', () => {
		expect(transposeNote('A', 3)).toBe('C');
		expect(transposeNote('A', 1, true)).toBe('Bb');
		expect(transposeSymbol('F#m7', 2)).toBe('G#m7');
		expect(transposeSymbol('C/E', 7)).toBe('G/B');
		expect(transposeSymbol('nope', 1)).toBeNull();
	});
	it('names intervals between MIDI notes', () => {
		expect(intervalBetween(45, 52)?.id).toBe('P5');
		expect(intervalBetween(52, 45)?.id).toBe('P5');
		expect(intervalBetween(40, 52)?.id).toBe('P8');
		expect(intervalBetween(40, 46)?.id).toBe('TT');
	});
	it('diatonic chords of a key', () => {
		expect(diatonic('G').map((c) => c.symbol)).toEqual(['G', 'Am', 'Bm', 'C', 'D', 'Em', 'F#dim']);
		expect(diatonic('F', true).map((c) => c.symbol)[3]).toBe('Bbmaj7');
	});
});

describe('fretboard positions', () => {
	it('pentatonic box 1 in A sits at fret 5, fingered 1-3-4', () => {
		const box = boxDots('A', 'minor-pentatonic', 1);
		expect(pos(box)).toEqual([
			'6:5',
			'6:8',
			'5:5',
			'5:7',
			'4:5',
			'4:7',
			'3:5',
			'3:7',
			'2:5',
			'2:8',
			'1:5',
			'1:8'
		]);
		expect(box.filter((d) => d.root).map((d) => `${d.string}:${d.fret}`)).toEqual([
			'6:5',
			'4:7',
			'1:5'
		]);
		expect(box.find((d) => d.fret === 8)?.finger).toBe(4);
		expect(box.find((d) => d.string === 5 && d.fret === 7)?.finger).toBe(3);
		expect(box.find((d) => d.string === 4 && d.fret === 7)?.token).toBe('1');
	});
	it('boxes climb the neck and wrap below box 1 past fret 15', () => {
		const lows = [1, 2, 3, 4, 5].map((b) =>
			Math.min(...boxDots('A', 'minor-pentatonic', b).map((d) => d.fret))
		);
		expect(lows).toEqual([5, 7, 9, 12, 2]);
		const e1 = boxDots('E', 'minor-pentatonic', 1);
		expect(Math.min(...e1.map((d) => d.fret))).toBe(0);
	});
	it('blues adds the b5 inside the box; 7-note scales are 3 per string', () => {
		const blues = boxDots('A', 'blues', 1);
		expect(blues.filter((d) => d.extra).map((d) => d.name)).toEqual(['Eb', 'Eb']);
		const g = boxDots('G', 'major', 1);
		expect(g).toHaveLength(18);
		expect(g.filter((d) => d.string === 6).map((d) => d.fret)).toEqual([3, 5, 7]);
	});
	it('CAGED shapes of any root', () => {
		expect(cagedOrder('C').map((s) => `${s.shape}${s.base}`)).toEqual([
			'C0',
			'A3',
			'G5',
			'E8',
			'D10'
		]);
		expect(cagedOrder('G').map((s) => s.shape)).toEqual(['G', 'E', 'D', 'C', 'A']);
		const e = cagedDots('C', 'E');
		expect(pos(e)).toEqual(['6:8', '5:10', '4:10', '3:9', '2:8', '1:8']);
		expect(e.map((d) => d.finger)).toEqual([1, 3, 4, 2, 1, 1]);
		// Open G keeps its open fingering.
		const g = cagedDots('G', 'G');
		expect(g.filter((d) => d.fret === 0).every((d) => d.finger === undefined)).toBe(true);
	});
	it('triads on a string set: three inversions, close voiced', () => {
		const shapes = triadShapes('C', 'major', [3, 2, 1]);
		const inv = new Set(shapes.map((s) => s.inversion));
		expect(inv).toEqual(new Set([0, 1, 2]));
		for (const s of shapes) {
			expect(s.dots.map((d) => d.string)).toEqual([3, 2, 1]);
			expect(new Set(s.dots.map((d) => d.name))).toEqual(new Set(['C', 'E', 'G']));
		}
		const root = shapes.find((s) => s.inversion === 0)!;
		expect(pos(root.dots)).toEqual(['3:5', '2:5', '1:3']);
		expect(new Set(root.dots.map((d) => d.finger)).size).toBe(3);
	});
	it('overlays: windows, notes and labels', () => {
		const notes = overlay({
			mode: 'notes',
			notes: 'naturals',
			strings: [6],
			frets: [0, 12],
			labels: 'notes'
		});
		expect(notes.dots.map((d) => d.name).join(' ')).toBe('E F G A B C D E');
		const box = overlay({
			mode: 'scale',
			scale: 'minor-pentatonic',
			root: 'A',
			box: 1,
			labels: 'intervals'
		});
		expect(box.window).toEqual([4, 9]);
		expect(box.title).toBe('A minor pentatonic · box 1');
		const c = overlay({ mode: 'note', note: 'C', labels: 'notes' });
		expect(c.dots.filter((d) => d.fret < 12)).toHaveLength(6);
		expect(
			dotLabel(
				box.dots.find((d) => d.token === 'b3')!,
				'intervals'
			)
		).toBe('♭3');
		expect(dotLabel(box.dots[0], 'intervals')).toBe('R');
	});
});

describe('::fretboard attributes', () => {
	it('parses and round-trips', () => {
		const problems: string[] = [];
		const spec = parseFretboard(
			{ scale: 'minor-pentatonic', root: 'A', box: '1', labels: 'intervals', frets: '5-8' },
			problems
		);
		expect(problems).toEqual([]);
		expect(spec).toMatchObject({ mode: 'scale', root: 'A', box: 1, frets: [5, 8] });
		expect(parseFretboard(fretboardParams(spec!), [])).toEqual(spec);
	});
	it('reports mistakes', () => {
		const p = (a: Record<string, string>) => {
			const out: string[] = [];
			parseFretboard(a, out);
			return out.join(' | ');
		};
		expect(p({ scale: 'minor-pentatonic' })).toMatch(/needs root=/);
		expect(p({ scale: 'nope', root: 'A' })).toMatch(/unknown scale/);
		expect(p({ scale: 'major', root: 'A', box: '9' })).toMatch(/box must be 1-7/);
		expect(p({ chord: 'major', root: 'C', box: '1' })).toMatch(/box= goes with scale=/);
		expect(p({ triads: 'major', root: 'C', strings: '1,3' })).toMatch(/three adjacent/);
		expect(p({ note: 'H' })).toMatch(/not a note name/);
		expect(p({ scale: 'major', chord: 'major', root: 'C' })).toMatch(/exactly one/);
		expect(p({ notes: 'naturals', frets: '20-22' })).toMatch(/frets must be/);
		expect(p({ caged: 'X', root: 'C' })).toMatch(/caged must be/);
		expect(p({ notes: 'naturals', colour: 'red' })).toMatch(/no attribute "colour"/);
	});
});

describe('note quiz', () => {
	it('rounds, targets and hits', () => {
		const spec = quizSpec('string-6');
		const round = makeRound(spec, () => 0.3);
		expect([...round].sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
		expect(targets('C', [6])).toEqual([{ string: 6, fret: 8 }]);
		expect(targets('C', quizSpec('note-C').strings)).toHaveLength(6);
		expect(hitOf('E', [6], 6, 12)).toEqual({ string: 6, fret: 0 });
		expect(hitOf('E', [6], 5, 7)).toBeNull();
		expect(hitOf('F', [6], 6, 2)).toBeNull();
		expect(quizSpec('all').prompts).toBe(3);
		expect(roundPassed(7, 0)).toBe(true);
		expect(roundPassed(7, 1)).toBe(false);
		expect(roundPassed(18, 1)).toBe(true);
	});
});
