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
	{ root: 'A', quality: 'maj7', voicings: [{ frets: 'x02120', fingers: '002130' }] },
	{ root: 'A', quality: 'm7b5', voicings: [{ frets: 'x0101x', fingers: '001020' }] },
	{ root: 'A', quality: 'm11', voicings: [{ frets: 'x00010', fingers: '000010' }] },
	{ root: 'A', quality: 'sus2', voicings: [{ frets: 'x02200', fingers: '001200' }] },
	{ root: 'A', quality: 'sus4', voicings: [{ frets: 'x02230', fingers: '001230' }] },
	{ root: 'C', quality: '', voicings: [{ frets: 'x32010', fingers: '032010' }] },
	{ root: 'C', quality: '7', voicings: [{ frets: 'x32310', fingers: '032410' }] },
	{ root: 'C', quality: 'add9', voicings: [{ frets: 'x32033', fingers: '021034' }] },
	{
		root: 'C',
		quality: 'maj7',
		voicings: [
			{ frets: 'x32000', fingers: '032000' },
			{ frets: 'x3545x', fingers: '013240', movable: true, label: 'Root 5' },
			{ frets: 'x324xx', fingers: '021400', movable: true, label: 'Shell' }
		]
	},
	{ root: 'C', quality: '6', voicings: [{ frets: 'x32210', fingers: '032410' }] },
	{
		root: 'C',
		quality: '9',
		voicings: [{ frets: 'x32333', fingers: '021333', barre: { fret: 3, from: 3, to: 5 } }]
	},
	{ root: 'C', quality: '6/9', voicings: [{ frets: 'x32233', fingers: '021133' }] },
	{
		root: 'C',
		quality: '11',
		voicings: [
			{ frets: 'x33333', fingers: '011111', barre: { fret: 3, from: 1, to: 5 }, movable: true }
		]
	},
	{
		root: 'C',
		quality: 'maj9',
		voicings: [{ frets: 'x3243x', fingers: '021430', movable: true, label: 'Root 5' }]
	},
	{ root: 'D', quality: '', voicings: [{ frets: 'xx0232', fingers: '000132' }] },
	{ root: 'D', quality: 'm', voicings: [{ frets: 'xx0231', fingers: '000231' }] },
	{ root: 'D', quality: '7', voicings: [{ frets: 'xx0212', fingers: '000213' }] },
	{
		root: 'D',
		quality: 'm7',
		voicings: [{ frets: 'xx0211', fingers: '000211', barre: { fret: 1, from: 4, to: 5 } }]
	},
	{
		root: 'D',
		quality: 'maj7',
		voicings: [{ frets: 'xx0222', fingers: '000111', barre: { fret: 2, from: 3, to: 5 } }]
	},
	{
		root: 'D',
		quality: 'm9',
		voicings: [{ frets: 'x5355x', fingers: '021340', movable: true, label: 'Root 5' }]
	},
	{
		root: 'D',
		quality: 'dim',
		voicings: [{ frets: 'xx0131', fingers: '000131', barre: { fret: 1, from: 3, to: 5 } }]
	},
	{ root: 'D', quality: 'dim7', voicings: [{ frets: 'xx0101', fingers: '000102' }] },
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
	{ root: 'G', quality: 'maj7', voicings: [{ frets: '320002', fingers: '210003' }] },
	{
		root: 'G',
		quality: '13',
		voicings: [{ frets: '3x345x', fingers: '102340', movable: true, label: 'Root 6' }]
	},
	{ root: 'B', quality: '7', voicings: [{ frets: 'x21202', fingers: '021304' }] },
	{
		root: 'Bb',
		quality: 'maj7',
		voicings: [{ frets: 'x102xx', fingers: '010200', label: 'Shell' }]
	},
	// Slash chords: the chord over another bass note ("G/F#" = G over an F# bass), for walking
	// bass lines. The bass is the lowest note; it may be outside the chord.
	{ root: 'G', quality: '', bass: 'F#', voicings: [{ frets: '2x0003', fingers: '100003' }] },
	{ root: 'G', quality: '', bass: 'B', voicings: [{ frets: 'x20003', fingers: '010003' }] },
	{ root: 'C', quality: '', bass: 'B', voicings: [{ frets: 'x22010', fingers: '032010' }] },
	{ root: 'C', quality: '', bass: 'G', voicings: [{ frets: '332010', fingers: '342010' }] },
	{ root: 'D', quality: '', bass: 'C', voicings: [{ frets: 'x30232', fingers: '030142' }] },
	{ root: 'D', quality: '', bass: 'F#', voicings: [{ frets: '2x0232', fingers: '100243' }] },
	{ root: 'A', quality: 'm', bass: 'G', voicings: [{ frets: '3x2210', fingers: '402310' }] },
	{
		root: 'F',
		quality: '',
		bass: 'C',
		voicings: [{ frets: 'x33211', fingers: '034211', barre: { fret: 1, from: 4, to: 5 } }]
	}
];

// Movable forms: `frets` are offsets from the root's fret (null = muted, -1 = one fret lower).
// The root sits on the 6th string (E shape), the 5th (A shape) or the 4th (D shape). Barre forms
// lay the index across the root's fret; `barre: false` shapes are closed (no barre, no open strings).
export const MOVABLE_SHAPES: MovableShape[] = [
	{ shape: 'E', quality: '', frets: [0, 2, 2, 1, 0, 0], fingers: [1, 3, 4, 2, 1, 1] },
	{ shape: 'E', quality: 'm', frets: [0, 2, 2, 0, 0, 0], fingers: [1, 3, 4, 1, 1, 1] },
	{ shape: 'E', quality: '7', frets: [0, 2, 0, 1, 0, 0], fingers: [1, 3, 1, 2, 1, 1] },
	{ shape: 'E', quality: 'm7', frets: [0, 2, 0, 0, 0, 0], fingers: [1, 3, 1, 1, 1, 1] },
	{ shape: 'A', quality: '', frets: [null, 0, 2, 2, 2, 0], fingers: [0, 1, 2, 3, 4, 1] },
	{ shape: 'A', quality: 'm', frets: [null, 0, 2, 2, 1, 0], fingers: [0, 1, 3, 4, 2, 1] },
	{ shape: 'A', quality: '7', frets: [null, 0, 2, 0, 2, 0], fingers: [0, 1, 3, 1, 4, 1] },
	{ shape: 'A', quality: 'm7', frets: [null, 0, 2, 0, 1, 0], fingers: [0, 1, 3, 1, 2, 1] },
	// maj7: E shape without the 5th-string and top-string notes (1-x-2-2-1-x is Fmaj7), A shape barred.
	{
		shape: 'E',
		quality: 'maj7',
		frets: [0, null, 1, 1, 0, null],
		fingers: [1, 0, 3, 4, 2, 0],
		barre: false,
		label: 'E-shape maj7'
	},
	{ shape: 'A', quality: 'maj7', frets: [null, 0, 2, 1, 2, 0], fingers: [0, 1, 3, 2, 4, 1] },
	// m7b5 (half-diminished): x-3-4-3-4-x is Cm7b5, 3-x-3-3-2-x is Gm7b5.
	{
		shape: 'A',
		quality: 'm7b5',
		frets: [null, 0, 1, 0, 1, null],
		fingers: [0, 2, 3, 1, 4, 0],
		barre: false,
		label: 'Root 5'
	},
	{
		shape: 'E',
		quality: 'm7b5',
		frets: [0, null, 0, 0, -1, null],
		fingers: [2, 0, 3, 4, 1, 0],
		barre: false,
		label: 'Root 6'
	},
	// dim7 (symmetrical: every note can be the root): x-x-1-2-1-2 is Ebdim7, 3-x-2-3-2-x is Gdim7.
	{
		shape: 'D',
		quality: 'dim7',
		frets: [null, null, 0, 1, 0, 1],
		fingers: [0, 0, 1, 3, 2, 4],
		barre: false,
		label: 'Root 4'
	},
	{
		shape: 'E',
		quality: 'dim7',
		frets: [0, null, -1, 0, -1, null],
		fingers: [2, 0, 1, 3, 1, 0],
		barre: false,
		label: 'Root 6'
	},
	// dim triad: x-2-3-4-3-x is Bdim; x-x-0-1-3-1 is Ddim (moved up: root on string 4).
	{
		shape: 'A',
		quality: 'dim',
		frets: [null, 0, 1, 2, 1, null],
		fingers: [0, 1, 2, 4, 3, 0],
		barre: false,
		label: 'Root 5'
	},
	{
		shape: 'D',
		quality: 'dim',
		frets: [null, null, 0, 1, 3, 1],
		fingers: [0, 0, 1, 2, 4, 1],
		barre: false,
		label: 'Root 4'
	}
];
