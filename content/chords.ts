// Chord library source data. Strings are listed low (6th) to high (1st).
// frets: "x" = muted, "0" = open, digits = fret (open chords stay below fret 10).
// fingers: 0 = none, 1 index, 2 middle, 3 ring, 4 pinky (same digits/colours everywhere).
// barre: fret and the strings it covers, 0 = low E string ... 5 = high e.
// Every voicing is checked against its chord spelling (npm run content:check / unit tests).
import type { OpenChordSource, MovableShape } from '../src/lib/chords/model.ts';

export const OPEN_CHORDS: OpenChordSource[] = [
	{ root: 'A', quality: '', voicings: [{ frets: 'x02220', fingers: '001230' }] },
	{ root: 'A', quality: 'm', voicings: [{ frets: 'x02210', fingers: '002310' }] },
	{
		root: 'A',
		quality: '7',
		voicings: [
			{ frets: 'x02020', fingers: '002030' },
			{ frets: 'x02223', fingers: '001234' }
		]
	},
	{ root: 'A', quality: 'm7', voicings: [{ frets: 'x02010', fingers: '002010' }] },
	{ root: 'A', quality: 'sus2', voicings: [{ frets: 'x02200', fingers: '001200' }] },
	{ root: 'A', quality: 'sus4', voicings: [{ frets: 'x02230', fingers: '001230' }] },
	{ root: 'C', quality: '', voicings: [{ frets: 'x32010', fingers: '032010' }] },
	{ root: 'C', quality: '7', voicings: [{ frets: 'x32310', fingers: '032410' }] },
	{ root: 'C', quality: 'add9', voicings: [{ frets: 'x32033', fingers: '021034' }] },
	{ root: 'D', quality: '', voicings: [{ frets: 'xx0232', fingers: '000132' }] },
	{ root: 'D', quality: 'm', voicings: [{ frets: 'xx0231', fingers: '000231' }] },
	{ root: 'D', quality: '7', voicings: [{ frets: 'xx0212', fingers: '000213' }] },
	{ root: 'D', quality: 'sus2', voicings: [{ frets: 'xx0230', fingers: '000130' }] },
	{ root: 'D', quality: 'sus4', voicings: [{ frets: 'xx0233', fingers: '000134' }] },
	{ root: 'E', quality: '', voicings: [{ frets: '022100', fingers: '023100' }] },
	{ root: 'E', quality: 'm', voicings: [{ frets: '022000', fingers: '023000' }] },
	{ root: 'E', quality: '7', voicings: [{ frets: '020100', fingers: '020100' }] },
	{
		root: 'E',
		quality: 'm7',
		voicings: [
			{ frets: '020000', fingers: '020000' },
			{ frets: '022030', fingers: '012030' }
		]
	},
	{
		root: 'F',
		quality: '',
		voicings: [
			{ frets: 'xx3211', fingers: '003211', barre: { fret: 1, from: 4, to: 5 }, label: 'Mini F' }
		]
	},
	{ root: 'F', quality: 'maj7', voicings: [{ frets: 'xx3210', fingers: '003210' }] },
	{
		root: 'G',
		quality: '',
		voicings: [
			{ frets: '320003', fingers: '210003' },
			{ frets: '320033', fingers: '210034' }
		]
	},
	{ root: 'G', quality: '7', voicings: [{ frets: '320001', fingers: '320001' }] },
	{ root: 'B', quality: '7', voicings: [{ frets: 'x21202', fingers: '021304' }] }
];

// Movable barre forms: `frets` are offsets from the barre fret (null = muted).
// The root sits on the 6th string (E shape) or the 5th string (A shape).
export const MOVABLE_SHAPES: MovableShape[] = [
	{ shape: 'E', quality: '', frets: [0, 2, 2, 1, 0, 0], fingers: [1, 3, 4, 2, 1, 1] },
	{ shape: 'E', quality: 'm', frets: [0, 2, 2, 0, 0, 0], fingers: [1, 3, 4, 1, 1, 1] },
	{ shape: 'E', quality: '7', frets: [0, 2, 0, 1, 0, 0], fingers: [1, 3, 1, 2, 1, 1] },
	{ shape: 'E', quality: 'm7', frets: [0, 2, 0, 0, 0, 0], fingers: [1, 3, 1, 1, 1, 1] },
	{ shape: 'A', quality: '', frets: [null, 0, 2, 2, 2, 0], fingers: [0, 1, 2, 3, 4, 1] },
	{ shape: 'A', quality: 'm', frets: [null, 0, 2, 2, 1, 0], fingers: [0, 1, 3, 4, 2, 1] },
	{ shape: 'A', quality: '7', frets: [null, 0, 2, 0, 2, 0], fingers: [0, 1, 3, 1, 4, 1] },
	{ shape: 'A', quality: 'm7', frets: [null, 0, 2, 0, 1, 0], fingers: [0, 1, 3, 1, 2, 1] }
];
