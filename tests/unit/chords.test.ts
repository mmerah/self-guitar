import { describe, expect, it } from 'vitest';
import {
	barreFret,
	checkVoicing,
	CHORDS,
	getChord,
	MAX_VOICINGS,
	CHANGE_CHORDS,
	voicingMidis,
	type Chord
} from '../../src/lib/chords';
import { startFret, toSvguitar } from '../../src/lib/chords/diagram';

const REQUIRED =
	'A Am A7 C C7 D Dm D7 E Em E7 F G G7 B7 Bm Fmaj7 Cadd9 Dsus2 Dsus4 Asus2 Asus4 Em7 Am7'.split(
		' '
	);

describe('chord library', () => {
	it('has every required chord with 1-3 voicings', () => {
		for (const id of REQUIRED) {
			const c = getChord(id);
			expect(c, id).toBeDefined();
			expect(c!.voicings.length).toBeGreaterThanOrEqual(1);
			expect(c!.voicings.length).toBeLessThanOrEqual(MAX_VOICINGS);
		}
		for (const id of CHANGE_CHORDS) expect(getChord(id), id).toBeDefined();
		expect(new Set(CHORDS.map((c) => c.id)).size).toBe(CHORDS.length);
	});

	it.each(CHORDS.map((c): [string, Chord] => [c.id, c]))(
		'%s voicings match the spelling',
		(_id, chord) => {
			for (const v of chord.voicings) expect(checkVoicing(chord, v)).toEqual([]);
		}
	);

	it('flags wrong voicings', () => {
		const am = getChord('Am')!;
		const asMajor = { ...am.voicings[0], frets: [null, 0, 2, 2, 2, 0] };
		expect(checkVoicing(am, asMajor).join()).toMatch(/stray note|missing/);
		expect(
			checkVoicing(getChord('C')!, {
				id: 'bad',
				kind: 'open',
				frets: [3, 3, 2, 0, 1, 0],
				fingers: [4, 3, 2, 0, 1, 0]
			})
		).toContain('bass note is not the root');
	});

	it('offers F as mini and full barre, Bm as a barre', () => {
		const f = getChord('F')!;
		expect(f.voicings[0].label).toBe('Mini F');
		expect(f.voicings[1]).toMatchObject({
			frets: [1, 3, 3, 2, 1, 1],
			barre: { fret: 1, from: 0, to: 5 }
		});
		expect(getChord('Bm')!.voicings[0]).toMatchObject({
			frets: [null, 2, 4, 4, 3, 2],
			barre: { fret: 2 }
		});
	});

	it('places movable barre shapes by root', () => {
		expect(barreFret('E', 'G')).toBe(3);
		expect(barreFret('A', 'C')).toBe(3);
		expect(barreFret('E', 'E')).toBeNull();
		const bb = getChord('Bb')!;
		expect(bb.voicings.map((v) => v.barre?.fret)).toEqual([1, 6]);
		expect(voicingMidis(getChord('E')!.voicings[0])).toEqual([40, 47, 52, 56, 59, 64]);
	});

	it('resolves enharmonic spellings and slugs to one canonical chord', () => {
		expect(getChord('Db')?.id).toBe('C#');
		expect(getChord('A#')?.id).toBe('Bb');
		expect(getChord('G#m')?.id).toBe('Abm');
		expect(getChord('D#')?.id).toBe('Eb');
		expect(getChord('Gb7')?.id).toBe('F#7');
		expect(getChord('C#m')?.slug).toBe('c-sharp-m');
		expect(getChord('c-sharp-m')?.id).toBe('C#m');
		expect(getChord('b-flat-m7')?.id).toBe('Bbm7');
		expect(getChord('g-7')?.id).toBe('G7');
		expect(getChord('H')).toBeUndefined();
		expect(new Set(CHORDS.map((c) => c.slug)).size).toBe(CHORDS.length);
		for (const c of CHORDS) expect(c.slug).toMatch(/^[a-z0-9-]+$/);
	});

	it('gives voicings stable ids, open forms before barres', () => {
		const g = getChord('G')!;
		expect(g.voicings.map((v) => v.id)).toEqual(['3-2-0-0-0-3', '3-2-0-0-3-3', '3-5-5-4-3-3']);
		for (const c of CHORDS) {
			expect(new Set(c.voicings.map((v) => v.id)).size).toBe(c.voicings.length);
			const kinds = c.voicings.map((v) => v.kind).join();
			expect(kinds).toMatch(/^(open,?)*(barre,?)*$/);
		}
		expect(getChord('Bb')!.voicings.every((v) => v.kind === 'barre')).toBe(true);
	});

	it('maps voicings to svguitar charts', () => {
		const g = toSvguitar(getChord('G')!.voicings[0]);
		expect(g.chord.position).toBe(1);
		expect(g.chord.fingers).toContainEqual([6, 3, { text: '2', className: 'finger-2' }]);
		expect(g.chord.fingers).toContainEqual([3, 0]);
		const cm = getChord('Cm')!.voicings.find((v) => v.barre?.fret === 3)!;
		expect(startFret(cm)).toBe(3);
		const chart = toSvguitar(cm).chord;
		expect(chart.barres[0]).toMatchObject({ fromString: 5, toString: 1, fret: 1 });
		expect(chart.fingers).toContainEqual([6, 'x']); // A shape: low E muted
	});
});
