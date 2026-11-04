// The skill tree: levels -> units -> skills (VISION §4). Lessons (content/lessons/L<n>/*.md) point
// at a unit and at skills by id. Ids are stable slugs: progress is stored against them, so never
// rename one that has shipped.
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
				id: 'rhythm-reading',
				title: 'Reading rhythm',
				skills: [
					{
						id: 'read-rhythm-values',
						name: 'Note values',
						description: 'Whole to 16th notes, dots, rests and triplets.'
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
		goal: 'Notes on strings 6 and 5, E- and A-shape barres, F and Bm, 7/sus/add9/maj7, keys and I–IV–V–vi; barre changes 40 a minute.',
		units: [
			{
				id: 'neck-notes-low',
				title: 'Notes on strings 6 and 5',
				skills: [
					{
						id: 'notes-string-6',
						name: 'Notes on string 6',
						description: 'Every natural note on the low E.'
					},
					{
						id: 'notes-string-5',
						name: 'Notes on string 5',
						description: 'Every natural note on the A string.'
					},
					{
						id: 'octave-shapes',
						name: 'Octave shapes',
						description: 'Two-string shapes that find the same note.'
					}
				]
			},
			{
				id: 'e-shape-barre',
				title: 'E-shape barre',
				skills: [
					{
						id: 'barre-e-shape',
						name: 'E-shape barre',
						description: 'The E shape moved up with a first-finger barre: F, G, A.'
					},
					{
						id: 'barre-e-minor-7',
						name: 'Em and E7 shapes',
						description: 'Minor and seventh barres from the E shape.'
					}
				]
			},
			{
				id: 'a-shape-barre',
				title: 'A-shape barre',
				skills: [
					{
						id: 'barre-a-shape',
						name: 'A-shape barre',
						description: 'The A shape on string 5: Bb, C, D.'
					},
					{
						id: 'barre-a-minor-7',
						name: 'Am and A7 shapes',
						description: 'Minor and seventh barres from the A shape.'
					}
				]
			},
			{
				id: 'f-and-bm',
				title: 'F and Bm',
				skills: [
					{
						id: 'chord-f-full',
						name: 'Full F',
						description: 'The six-string F barre, every string ringing.'
					},
					{
						id: 'chord-bm',
						name: 'Bm',
						description: 'B minor on string 5, and its changes.'
					},
					{
						id: 'barre-changes',
						name: 'Barre changes',
						description: 'Open-to-barre changes, 40 a minute.'
					}
				]
			},
			{
				id: 'color-chords',
				title: '7, sus, add9, maj7',
				skills: [
					{
						id: 'sus-chords',
						name: 'sus2 and sus4',
						description: 'Suspended chords and how they resolve.'
					},
					{
						id: 'add9-maj7-chords',
						name: 'add9 and maj7',
						description: 'Open colour chords: Cadd9, Gmaj7, Fmaj7.'
					},
					{
						id: 'seventh-shapes',
						name: 'Moveable 7ths',
						description: '7, m7 and maj7 barre shapes.'
					},
					{
						id: 'slash-chords-bass-walks',
						name: 'Slash chords & bass walks',
						description: 'Chords over a new bass note, and bass lines that walk between them.'
					}
				]
			},
			{
				id: 'keys-harmony',
				title: 'Keys & diatonic harmony',
				skills: [
					{
						id: 'keys-major',
						name: 'Major keys',
						description: 'A key, its scale and its notes.'
					},
					{
						id: 'diatonic-chords',
						name: 'Diatonic chords',
						description: 'I ii iii IV V vi vii° in a major key.'
					},
					{
						id: 'progressions-l4',
						name: 'I–IV–V–vi',
						description: 'The common progressions in five keys.'
					},
					{
						id: 'minor-keys',
						name: 'Minor keys',
						description: 'The relative minor, the harmonic-minor V7 and i–iv–V.'
					}
				]
			},
			{
				id: 'capo-transpose',
				title: 'Capo & transposing',
				skills: [
					{
						id: 'transpose-chords',
						name: 'Transposing',
						description: 'Move a song to another key.'
					},
					{
						id: 'capo-keys',
						name: 'Capo for any key',
						description: 'Open shapes in any key with a capo.'
					},
					{
						id: 'songwriting-four-chords',
						name: 'Four chords, your key',
						description: 'I–V–vi–IV with a capo set for your voice.'
					}
				]
			},
			{
				id: 'sixteenths-intro',
				title: '16th-note strumming',
				skills: [
					{
						id: 'strum-sixteenths',
						name: 'Counting 16ths',
						description: '1 e & a: down on the beat, up on the "a".'
					},
					{
						id: 'strum-16-patterns',
						name: 'First 16th patterns',
						description: 'Two 16th patterns in a song.'
					},
					{
						id: 'compound-six-eight',
						name: '6/8 strumming',
						description: 'Two big beats of three: the 6/8 ballad strum.'
					}
				]
			},
			{
				id: 'ear-theory-4',
				title: 'Ear & theory IV',
				skills: [
					{
						id: 'ear-chord-quality',
						name: 'Chord quality',
						description: 'Major, minor and 7 by ear.'
					},
					{
						id: 'ear-progressions-145',
						name: 'I, IV and V by ear',
						description: 'Name the chords of a simple progression.'
					}
				]
			}
		]
	},
	{
		id: 5,
		title: 'Blues & lead',
		goal: 'Minor pentatonic in five boxes, major pentatonic, hammer-ons, pull-offs, slides, bends and the shuffle; pentatonic 8ths at 100, improvise 12 bars.',
		units: [
			{
				id: 'minor-pentatonic',
				title: 'Minor pentatonic',
				skills: [
					{
						id: 'pentatonic-box-1',
						name: 'Box 1',
						description: 'The A minor pentatonic box at fret 5.'
					}
				]
			},
			{
				id: 'lead-techniques',
				title: 'Hammer, pull, slide, bend',
				skills: [
					{
						id: 'hammer-pull',
						name: 'Hammer-ons and pull-offs',
						description: 'Notes from the fretting hand alone.'
					},
					{
						id: 'slides',
						name: 'Slides',
						description: 'Glide between frets in time.'
					},
					{
						id: 'bends',
						name: 'Bends',
						description: 'Bend a note up to pitch: half and whole step.'
					},
					{
						id: 'vibrato',
						name: 'Vibrato',
						description: 'A steady, even vibrato on held notes.'
					},
					{
						id: 'alternate-picking',
						name: 'Alternate picking',
						description: 'Down-up picking and clean string crossing.'
					}
				]
			},
			{
				id: 'blues-shuffle-12',
				title: 'Shuffle & 12-bar soloing',
				skills: [
					{
						id: 'shuffle-rhythm',
						name: 'Shuffle rhythm',
						description: 'Swung 8ths and the shuffle in A and E.'
					},
					{
						id: 'twelve-bar-solo',
						name: 'Soloing over 12 bars',
						description: 'Box 1 over a 12-bar blues.'
					},
					{
						id: 'blues-turnarounds',
						name: 'Turnarounds',
						description: 'The last two bars that bring it round.'
					}
				]
			},
			{
				id: 'pentatonic-neck',
				title: 'Boxes across the neck',
				skills: [
					{
						id: 'pentatonic-boxes-2-3',
						name: 'Boxes 2 and 3',
						description: 'The next two boxes up the neck.'
					},
					{
						id: 'pentatonic-boxes-4-5',
						name: 'Boxes 4 and 5',
						description: 'The last boxes, back to box 1.'
					},
					{
						id: 'pentatonic-connect',
						name: 'Connect the boxes',
						description: 'Slide between boxes across the neck.'
					}
				]
			},
			{
				id: 'major-pentatonic',
				title: 'Major pentatonic',
				skills: [
					{
						id: 'major-pentatonic',
						name: 'Major pentatonic',
						description: 'The same shapes, a brighter root.'
					},
					{
						id: 'major-minor-pentatonic',
						name: 'Major or minor',
						description: 'Choose the sound over a blues.'
					}
				]
			},
			{
				id: 'improvisation',
				title: 'Call & response',
				skills: [
					{
						id: 'call-response',
						name: 'Call and response',
						description: 'Answer a phrase with a phrase.'
					},
					{
						id: 'phrasing-licks',
						name: 'Licks and phrasing',
						description: 'Space, repetition, a few strong licks.'
					},
					{
						id: 'improvise-12',
						name: 'Improvise 12 bars',
						description: 'A full chorus of your own.'
					}
				]
			},
			{
				id: 'blues-fingerpicking',
				title: 'Blues fingerpicking',
				skills: [
					{
						id: 'blues-thumb-bass',
						name: 'Monotonic thumb',
						description: 'A steady thumb on the bass, melody on top.'
					},
					{
						id: 'blues-fingerstyle-12',
						name: 'Fingerpicked 12-bar',
						description: 'A 12-bar blues in E, fingerstyle.'
					}
				]
			},
			{
				id: 'ear-theory-5',
				title: 'Ear & theory V',
				skills: [
					{
						id: 'ear-intervals-l5',
						name: '4ths, 5ths, octaves',
						description: 'Hear P4, P5 and P8.'
					},
					{
						id: 'ear-dominant-7',
						name: 'The 7 chord',
						description: 'Hear the bluesy dominant 7.'
					}
				]
			}
		]
	},
	{
		id: 6,
		title: 'Fretboard',
		goal: 'Notes on the neck, CAGED, triads, the major scale in three positions, 16th strumming and syncopation; any chord in 3 positions, 16ths at 90.',
		units: [
			{
				id: 'neck-notes',
				title: 'Notes on the neck',
				skills: [
					{
						id: 'notes-all-strings',
						name: 'Notes everywhere',
						description: 'Find any note on any string.'
					}
				]
			},
			{
				id: 'caged-system',
				title: 'CAGED system',
				skills: [
					{
						id: 'caged-shapes',
						name: 'The five shapes',
						description: 'C A G E D shapes of one chord up the neck.'
					},
					{
						id: 'caged-connect',
						name: 'Connect the shapes',
						description: 'Move between neighbouring shapes.'
					},
					{
						id: 'caged-arpeggios',
						name: 'CAGED arpeggios',
						description: 'Chord tones around each shape.'
					}
				]
			},
			{
				id: 'triads-sets',
				title: 'Triads on string sets',
				skills: [
					{
						id: 'triads-top-strings',
						name: 'Triads on strings 1–3',
						description: 'Major and minor triads, three inversions.'
					},
					{
						id: 'triads-middle-strings',
						name: 'Triads on 2–4 and 3–5',
						description: 'The same triads lower down.'
					},
					{
						id: 'triad-inversions',
						name: 'Inversions in songs',
						description: 'Voice-led triads over a progression.'
					},
					{
						id: 'chord-melody-intro',
						name: 'First chord melody',
						description: 'A melody on top of triad shapes.'
					}
				]
			},
			{
				id: 'major-scale-positions',
				title: 'Major scale in 3 positions',
				skills: [
					{
						id: 'major-scale-pos-1',
						name: 'Position 1',
						description: 'The major scale from the 6th-string root.'
					},
					{
						id: 'major-scale-pos-2-3',
						name: 'Positions 2 and 3',
						description: 'Two more positions, linked.'
					},
					{
						id: 'major-scale-3nps',
						name: 'Three notes per string',
						description: 'Fast, even runs across the neck.'
					}
				]
			},
			{
				id: 'sixteenths-syncopation',
				title: '16ths & syncopation',
				skills: [
					{
						id: 'strum-16-groove',
						name: '16th groove',
						description: 'Accents and ghost strums in a 16th groove at 90.'
					},
					{
						id: 'syncopation',
						name: 'Syncopation',
						description: 'Ties and pushes off the beat.'
					},
					{
						id: 'muted-16ths',
						name: 'Muted 16ths',
						description: 'Percussive mutes inside the strum.'
					}
				]
			},
			{
				id: 'ear-theory-6',
				title: 'Interval ear training',
				skills: [
					{
						id: 'ear-intervals-all',
						name: 'All intervals',
						description: 'm2 to the octave, up and down.'
					},
					{
						id: 'ear-intervals-harmonic',
						name: 'Intervals together',
						description: 'Intervals played as one sound.'
					},
					{
						id: 'sing-play-back',
						name: 'Play it back',
						description: 'Hear a note, find it on the neck.'
					}
				]
			}
		]
	},
	{
		id: 7,
		title: 'Classical & folk studies',
		goal: 'Read notation, rest and free strokes, studies by Carcassi, Sor, Giuliani and Carulli, harmonics, DADGAD and open tunings; one study, start to end, at a steady tempo.',
		units: [
			{
				id: 'notation-basics',
				title: 'Reading notation',
				skills: [
					{
						id: 'read-staff-notes',
						name: 'Notes on the staff',
						description: 'First-position notes in standard notation.'
					},
					{
						id: 'read-rhythms',
						name: 'Rhythms and rests',
						description: 'Note values, rests and ties.'
					},
					{
						id: 'read-key-signatures',
						name: 'Key signatures',
						description: 'Sharps and flats at the start of a line.'
					}
				]
			},
			{
				id: 'classical-technique',
				title: 'Classical technique',
				skills: [
					{
						id: 'rest-stroke',
						name: 'Rest stroke',
						description: 'Apoyando: the finger comes to rest on the next string.'
					},
					{
						id: 'free-stroke',
						name: 'Free stroke',
						description: 'Tirando: the finger clears the strings.'
					},
					{
						id: 'pima-independence',
						name: 'p-i-m-a independence',
						description: 'Fingers alternating cleanly, the thumb free.'
					}
				]
			},
			{
				id: 'studies',
				title: 'Studies',
				skills: [
					{
						id: 'study-carcassi',
						name: 'A Carcassi study',
						description: 'An arpeggio study from Op. 60.'
					},
					{
						id: 'study-sor',
						name: 'A Sor study',
						description: 'A Sor study, melody singing over the bass.'
					},
					{
						id: 'study-giuliani',
						name: 'A Giuliani study',
						description: 'Right-hand patterns from Op. 50.'
					},
					{
						id: 'study-carulli',
						name: 'A Carulli piece',
						description: 'A Carulli waltz or andantino.'
					}
				]
			},
			{
				id: 'harmonics',
				title: 'Harmonics',
				skills: [
					{
						id: 'natural-harmonics',
						name: 'Natural harmonics',
						description: 'Bell tones at frets 12, 7 and 5.'
					},
					{
						id: 'artificial-harmonics',
						name: 'Artificial harmonics',
						description: 'Harmonics an octave above any fretted note.'
					}
				]
			},
			{
				id: 'alt-tunings',
				title: 'Alternate tunings',
				skills: [
					{
						id: 'tuning-dadgad',
						name: 'DADGAD',
						description: 'Tune to DADGAD and play its open shapes.'
					},
					{
						id: 'tuning-open-d',
						name: 'Open D',
						description: 'Open D tuning and its drones.'
					},
					{
						id: 'tuning-open-g',
						name: 'Open G',
						description: 'Open G tuning and slide-friendly shapes.'
					}
				]
			},
			{
				id: 'solo-folk',
				title: 'Solo folk pieces',
				skills: [
					{
						id: 'melody-and-bass',
						name: 'Melody and bass',
						description: 'A folk tune with its bass line together.'
					},
					{
						id: 'folk-solo-pieces',
						name: 'Folk solo pieces',
						description: 'Two traditional tunes, solo.'
					}
				]
			}
		]
	},
	{
		id: 8,
		title: 'Advanced acoustic',
		goal: 'Percussive technique, advanced Travis and solo arrangements, jazz chords and voice leading, modes and fingerstyle blues; a groove at 90, a modal solo.',
		units: [
			{
				id: 'percussive',
				title: 'Percussive technique',
				skills: [
					{
						id: 'slap-percussion',
						name: 'Slaps and body hits',
						description: 'Kick and snare sounds from the guitar.'
					},
					{
						id: 'thumb-slap',
						name: 'Thumb hits',
						description: 'A thumb slap on the bass strings as the backbeat.'
					},
					{
						id: 'string-snaps',
						name: 'String snaps',
						description: 'Snap and pop accents.'
					},
					{
						id: 'percussive-groove',
						name: 'Percussive groove',
						description: 'A full groove at 90, steady.'
					}
				]
			},
			{
				id: 'travis-advanced',
				title: 'Advanced Travis',
				skills: [
					{
						id: 'travis-melody',
						name: 'Melody over Travis',
						description: 'A tune on top of the alternating thumb.'
					},
					{
						id: 'travis-solo-arrangement',
						name: 'Travis solo arrangement',
						description: 'A whole song arranged Travis-style.'
					}
				]
			},
			{
				id: 'jazz-chords',
				title: 'Jazz & extended chords',
				skills: [
					{
						id: 'extended-chords',
						name: 'Extended chords',
						description: '9ths, 11ths and 13ths on the guitar.'
					},
					{
						id: 'voice-leading',
						name: 'Voice leading',
						description: 'Move each voice the least.'
					},
					{
						id: 'ii-v-i',
						name: 'ii–V–I',
						description: 'The jazz cadence in three keys.'
					}
				]
			},
			{
				id: 'modes',
				title: 'Modes',
				skills: [
					{
						id: 'modes-major',
						name: 'The seven modes',
						description: 'Modes of the major scale and their sound.'
					},
					{
						id: 'modal-vamps',
						name: 'Modal vamps',
						description: 'Dorian and Mixolydian over a drone.'
					},
					{
						id: 'modal-solo',
						name: 'A modal solo',
						description: 'Solo over a one-chord vamp.'
					}
				]
			},
			{
				id: 'fingerstyle-blues',
				title: 'Fingerstyle blues',
				skills: [
					{
						id: 'alternating-blues',
						name: 'Piedmont blues',
						description: 'Alternating-bass blues, ragtime feel.'
					},
					{
						id: 'blues-fingerstyle-licks',
						name: 'Fingerstyle licks',
						description: 'Licks with the thumb still going.'
					}
				]
			},
			{
				id: 'ear-theory-8',
				title: 'Ear & theory VIII',
				skills: [
					{
						id: 'ear-extended-chords',
						name: 'Seventh chords by ear',
						description: 'maj7, m7 and 7 apart.'
					},
					{
						id: 'ear-modes',
						name: 'Modes by ear',
						description: 'Hear Dorian from Mixolydian.'
					}
				]
			}
		]
	},
	{
		id: 9,
		title: 'Expert',
		goal: 'Arrange a folk tune for solo guitar, transcribe by ear, sight-read and play a performance set; a 3-piece set, 16 bars transcribed.',
		units: [
			{
				id: 'arranging',
				title: 'Arranging a folk tune',
				skills: [
					{
						id: 'arrange-melody',
						name: 'Melody first',
						description: 'Place the melody on the top strings.'
					},
					{
						id: 'arrange-harmony',
						name: 'Bass and harmony',
						description: 'Fill in bass and chords under it.'
					},
					{
						id: 'arrange-full',
						name: 'A full arrangement',
						description: 'A solo arrangement, start to finish.'
					}
				]
			},
			{
				id: 'transcription',
				title: 'Transcription by ear',
				skills: [
					{
						id: 'transcribe-melody',
						name: 'Melodies by ear',
						description: 'Work out a tune from a recording.'
					},
					{
						id: 'transcribe-chords',
						name: 'Chords by ear',
						description: "Work out a song's chords."
					},
					{
						id: 'transcribe-16-bars',
						name: '16 bars',
						description: 'Transcribe 16 bars into tab.'
					}
				]
			},
			{
				id: 'sight-reading',
				title: 'Sight-reading',
				skills: [
					{
						id: 'sight-read-melody',
						name: 'Sight-read melodies',
						description: 'Play a new melody at first sight.'
					},
					{
						id: 'sight-read-rhythm',
						name: 'Sight-read rhythm',
						description: 'Read rhythms ahead of the beat.'
					}
				]
			},
			{
				id: 'performance',
				title: 'Practising for performance',
				skills: [
					{
						id: 'performance-set',
						name: 'Build a set',
						description: 'Three pieces in an order that works.'
					},
					{
						id: 'record-yourself',
						name: 'Record yourself',
						description: 'Record, listen back, fix one thing.'
					},
					{
						id: 'play-through',
						name: 'Play through mistakes',
						description: 'Keep the music going, whatever happens.'
					}
				]
			},
			{
				id: 'personal-style',
				title: 'Personal style',
				skills: [
					{
						id: 'style-influences',
						name: 'Influences',
						description: 'Learn from three players you love.'
					},
					{
						id: 'compose-piece',
						name: 'Compose a piece',
						description: 'Write a short piece of your own.'
					}
				]
			}
		]
	}
];
