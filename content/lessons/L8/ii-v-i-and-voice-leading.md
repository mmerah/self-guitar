---
id: ii-v-i-and-voice-leading
title: ii–V–I and voice leading
level: 8
unit: jazz-chords
order: 2
skills: [ii-v-i, voice-leading]
prereqs: [seventh-chords-and-extensions]
minutes: 10
mastery: { type: exercise, id: ii-v-i-shells-three-keys, bpm: 100 }
---

ii–V–I is the cadence that drives most jazz standards. Goal: comp it in quarter notes in C, F and B♭ at 100 BPM, moving every voice the shortest way.

## How to practise this

- 2 minutes: C only, slowly. Name the note that moves at each change ("C goes to B").
- 4 minutes: the three keys on the tempo ladder, from 65 BPM. Short, even quarters, like a jazz rhythm guitarist.
- 3 minutes: the version with 9ths and 13ths.
- 1 minute: only the two guide tones (strings 4 and 3) through all three keys.

## The cadence

Build seventh chords on degrees 2, 5 and 1 of a major key: ii is m7, V is 7, I is maj7. Each root falls a fifth to the next.

- **C major:** Dm7 – G7 – Cmaj7
- **F major:** Gm7 – C7 – Fmaj7
- **B♭ major:** Cm7 – F7 – B♭maj7

## Voice leading

Voice leading means moving each note of a chord to the nearest note of the next. Jazz players start with **shells**: just root, 3rd and 7th. The 3rd and 7th are the **guide tones**, the notes the ear follows.

Dm7 to G7: the 3rd of Dm7 (F) stays and becomes the 7th of G7, and the 7th of Dm7 (C) slides one fret down to B, the 3rd of G7. G7 to Cmaj7: F slides to E, B stays. Only the root jumps.

```atex
\tempo 70
:2 (5.5 3.4 5.3){ch "Dm7"} (3.6 3.4 4.3){ch "G7"} | :1 (3.5 2.4 4.3){ch "Cmaj7"}
```

::exercise{id="ii-v-i-shells-three-keys"}

## Dressing it up

Add a fourth note on string 2: the 9th on Dm7, the 13th on G7, the 9th on Cmaj7. The new top line, E–E–D, voice-leads too. The last chord, C6/9, adds the 6th and 9th to a C major triad.

::exercise{id="ii-v-i-extensions-c"}

## The minor ii–V–i

In a minor key, ii is half-diminished and V is still a dominant 7: in A minor, Bm7b5 – E7 – Am. Here A slides down to G♯ and back up to A, while D stays and then falls to C.

```atex
\tempo 60
:1 (2.5 3.4 2.3 3.2){ch "Bm7b5"} | (0.6 2.5 0.4 1.3 3.2 0.1){ch "E7"} | (0.5 2.4 2.3 1.2 0.1){ch "Am"}
```

:::warning
Common mistakes:

- Lifting the whole hand at each change. Keep shared notes pressed; slide the others.
- Letting string 5 ring under root-6 shells. The underside of the bass finger mutes it.
- Long, ringing quarters. Release the pressure after each one so the comp stays light.

:::

**Mastery check:** three clean passes in a row of the ii–V–I shells in three keys at 100 BPM.
