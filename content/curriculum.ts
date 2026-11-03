// The skill tree: levels -> units -> skills (VISION §4). Lessons (content/lessons/L<n>/*.md) point
// at a unit and at skills by id. Ids are stable slugs: progress is stored against them, so never
// rename one that has shipped. Levels 4-9 have no units yet (M6).
import type { Level } from '../src/lib/learn/types.ts';

export const CURRICULUM: Level[] = [
	{
		id: 0,
		title: 'Setup',
		goal: 'Hold, tune and read the guitar, and make your first clean sounds.',
		units: [
			{
				id: 'meet-the-guitar',
				title: 'Meet the guitar',
				skills: [
					{
						id: 'guitar-parts',
						name: 'Parts of the guitar',
						description: 'Name the parts you will hear about in every lesson.'
					},
					{
						id: 'posture',
						name: 'Sitting posture',
						description: 'A relaxed, stable way to hold the guitar.'
					},
					{
						id: 'fretting-hand',
						name: 'Fretting hand',
						description: 'Thumb behind the neck, fingertips just behind the fret.'
					}
				]
			},
			{
				id: 'tuning',
				title: 'Tuning',
				skills: [
					{
						id: 'tune-with-tuner',
						name: 'Tune with a tuner',
						description: 'Bring all six strings within ±5 cents.'
					}
				]
			},
			{
				id: 'reading',
				title: 'Reading tab & diagrams',
				skills: [
					{
						id: 'read-tab',
						name: 'Read tab',
						description: 'Strings, fret numbers and rhythm stems in tablature.'
					},
					{
						id: 'read-chord-diagrams',
						name: 'Read chord diagrams',
						description: 'Frets, finger numbers, open and muted strings.'
					}
				]
			},
			{
				id: 'first-sounds',
				title: 'First sounds',
				skills: [
					{
						id: 'pick-and-fingers',
						name: 'Pick and fingers',
						description: 'Hold a pick and play with the thumb and fingers.'
					},
					{
						id: 'open-string-rhythm',
						name: 'Open-string rhythm',
						description: 'Steady quarter notes on open strings with a click.'
					},
					{
						id: 'first-notes-e-b',
						name: 'First notes on E and B',
						description: 'Fretted notes on the two highest strings.'
					},
					{
						id: 'finger-warmup',
						name: 'Finger warm-up',
						description: 'A 1-2-3-4 drill for finger independence and calluses.'
					},
					{ id: 'first-strum', name: 'First strum', description: 'Down-strums on Em, in time.' }
				]
			}
		]
	},
	{
		id: 1,
		title: 'Open chords I',
		goal: 'Play E, Em, Am, A, D, C and G in time, count eighths and add up-strums; 30 changes a minute per pair.',
		units: [
			{
				id: 'minor-chords',
				title: 'E, Em and Am',
				skills: [
					{
						id: 'open-chords-em-am',
						name: 'Em and Am chords',
						description: 'Two minor chords, and the E shape they share.'
					},
					{
						id: 'changes-minor',
						name: 'First changes',
						description: '1-minute changes between Em, E and Am.'
					}
				]
			},
			{
				id: 'chords-a-d-e',
				title: 'A and D',
				skills: [
					{
						id: 'open-chords-a-d-e',
						name: 'A, D and E chords',
						description: 'Three major chords that ring clearly.'
					},
					{
						id: 'changes-a-d-e',
						name: 'A–D–E changes',
						description: '1-minute changes between A, D and E.'
					},
					{
						id: 'song-two-chords',
						name: 'A two-chord song',
						description: 'Drunken Sailor on Em and D, start to finish.'
					}
				]
			},
			{
				id: 'chords-c-g',
				title: 'C and G',
				skills: [
					{
						id: 'open-chords-c-g',
						name: 'C and G chords',
						description: 'The two big stretches of the open chords.'
					},
					{ id: 'changes-c-g', name: 'C–G changes', description: 'C–G, G–D and C–Am changes.' }
				]
			},
			{
				id: 'down-strums',
				title: 'Down-strums in time',
				skills: [
					{
						id: 'strum-quarters',
						name: 'Quarter-note strums',
						description: 'Four even down-strums a bar at 70 BPM.'
					},
					{
						id: 'progressions-l1',
						name: 'First progressions',
						description: 'Four-chord progressions without stopping.'
					}
				]
			},
			{
				id: 'ear-theory-1',
				title: 'Ear & theory I',
				skills: [
					{
						id: 'ear-major-minor',
						name: 'Major or minor?',
						description: 'Hear the difference between major and minor chords.'
					},
					{
						id: 'open-string-names',
						name: 'Open-string names',
						description: 'E A D G B E and what the numbers mean.'
					}
				]
			},
			{
				id: 'counting-eighths',
				title: 'Counting & eighth notes',
				skills: [
					{
						id: 'count-eighths',
						name: 'Counting 1 & 2 &',
						description: 'Count and clap eighth-note rhythms.'
					},
					{
						id: 'ear-chord-changes',
						name: 'Hear the change',
						description: 'Hear when a song moves to a new chord.'
					},
					{
						id: 'strum-eighths',
						name: 'Eighth-note strums',
						description: 'Down on the beat, up on the "and".'
					}
				]
			}
		]
	},
	{
		id: 2,
		title: 'Rhythm I',
		goal: 'D–DU–UDU for 2 minutes at 80 BPM, muting, Dm, Fmaj7/mini F, capo and the 12-bar blues; 50 changes a minute.',
		units: [
			{
				id: 'eighth-strums',
				title: 'Strumming patterns',
				skills: [
					{
						id: 'strum-d-du-udu',
						name: 'D–DU–UDU',
						description: 'The all-purpose folk pattern, with missed strums.'
					},
					{
						id: 'strum-accents',
						name: 'Accents & dynamics',
						description: 'Play some strums louder to make a groove.'
					},
					{
						id: 'strum-while-singing',
						name: 'Strum and sing',
						description: 'Keep the strum on autopilot while you sing.'
					}
				]
			},
			{
				id: 'new-chords-2',
				title: 'Dm, Fmaj7 and mini F',
				skills: [
					{ id: 'chord-dm', name: 'Dm chord', description: 'D minor and its changes.' },
					{
						id: 'chord-fmaj7-mini-f',
						name: 'Fmaj7 and mini F',
						description: 'The stepping stones to the full F barre.'
					},
					{
						id: 'changes-50',
						name: 'Faster changes',
						description: 'New pairs to 40 a minute, familiar pairs to 50.'
					}
				]
			},
			{
				id: 'capo',
				title: 'Using a capo',
				skills: [
					{
						id: 'capo-basics',
						name: 'Capo basics',
						description: 'Place a capo and transpose chord shapes.'
					}
				]
			},
			{
				id: 'muting',
				title: 'Muting & string control',
				skills: [
					{
						id: 'muting-string-control',
						name: 'Muting',
						description: 'Silence unwanted bass strings; choke chords short.'
					}
				]
			},
			{
				id: 'twelve-bar',
				title: '12-bar form',
				skills: [
					{
						id: 'seventh-chords',
						name: 'E7, A7, B7',
						description: 'Open seventh chords for blues.'
					},
					{
						id: 'twelve-bar-form',
						name: '12-bar form',
						description: 'Play and count a 12-bar progression.'
					},
					{
						id: 'boogie-shuffle',
						name: 'Boogie shuffle',
						description: 'The two-string E5–E6 shuffle riff, swung.'
					}
				]
			},
			{
				id: 'boom-chick',
				title: 'Bass and strum',
				skills: [
					{
						id: 'bass-strum',
						name: 'Boom-chick',
						description: 'Alternating bass note and strum: from strumming to fingerstyle.'
					}
				]
			}
		]
	},
	{
		id: 3,
		title: 'Fingerstyle I',
		goal: 'p-i-m-a, arpeggios, alternating bass and Travis picking; Travis C–G–Am at 70 BPM.',
		units: [
			{
				id: 'pima',
				title: 'p-i-m-a',
				skills: [
					{ id: 'pima-basics', name: 'p-i-m-a', description: 'Which finger plays which string.' },
					{
						id: 'arpeggio-patterns',
						name: 'Arpeggio patterns',
						description: 'Pick chords one string at a time.'
					}
				]
			},
			{
				id: 'travis',
				title: 'Alternating bass & Travis',
				skills: [
					{
						id: 'alternating-bass',
						name: 'Alternating bass',
						description: 'A steady thumb between two bass strings.'
					},
					{
						id: 'travis-picking',
						name: 'Travis picking',
						description: 'Melody fingers over the alternating thumb.'
					}
				]
			},
			{
				id: 'first-position',
				title: 'First-position notes',
				skills: [
					{
						id: 'notes-high-strings',
						name: 'Notes on strings 1–3',
						description: 'E F G, B C D, G A in first position.'
					},
					{
						id: 'notes-low-strings',
						name: 'Notes on strings 4–6',
						description: 'D E F, A B C, E F G in first position.'
					}
				]
			},
			{
				id: 'ear-theory-3',
				title: 'Ear & theory III',
				skills: [
					{
						id: 'c-major-scale',
						name: 'C major scale',
						description: 'Play and sing the C major scale.'
					},
					{
						id: 'ear-intervals',
						name: 'First intervals',
						description: 'Hear steps, thirds and fifths.'
					}
				]
			}
		]
	},
	{
		id: 4,
		title: 'Barre & harmony',
		goal: 'E- and A-shape barres, 7/sus/add9 chords, keys and I–IV–V–vi.',
		units: []
	},
	{
		id: 5,
		title: 'Blues & lead',
		goal: 'Pentatonic positions, hammer-ons, pull-offs, slides, bends and the shuffle.',
		units: []
	},
	{
		id: 6,
		title: 'Fretboard',
		goal: 'CAGED, triads, the major scale in three positions and 16th-note strumming.',
		units: []
	},
	{
		id: 7,
		title: 'Classical & folk studies',
		goal: 'Studies by Carcassi, Sor and Giuliani, open tunings and reading notation.',
		units: []
	},
	{
		id: 8,
		title: 'Advanced acoustic',
		goal: 'Percussive technique, extended chords, modes and blues fingerstyle.',
		units: []
	},
	{
		id: 9,
		title: 'Expert',
		goal: 'Arrange, transcribe by ear, sight-read and play a performance set.',
		units: []
	}
];
