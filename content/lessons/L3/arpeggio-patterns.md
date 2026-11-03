---
id: arpeggio-patterns
title: Arpeggio patterns on open chords
level: 3
unit: pima
order: 2
skills: [arpeggio-patterns]
prereqs: [pima-basics, chord-dm]
minutes: 7
mastery: { type: exercise, id: arpeggio-p-i-m-i, bpm: 80 }
---

An arpeggio is a chord played one note at a time; the order of the fingers gives each pattern its mood. Here are two you can use under almost any slow song.

## How to practise this

- 2 minutes: each pattern on one chord (Am) until it feels automatic.
- 4 minutes: the p-i-m-i exercise from 52 BPM up to 80.
- Change chords on the thumb note. Get the new chord down just before beat 1.
- Review: 2 minutes of the p-i-m-a exercise on C, Am, Em, G.

## p-i-m-i (4/4)

Thumb, index, middle, back to index. Twice per bar, eight even notes:

```atex
\tempo 70
:8 0.5{ch "Am"} 2.3 1.2 2.3 0.5 2.3 1.2 2.3
```

The exercise runs it through C, Am, Dm and G. Watch the thumb: it moves to string 5 for C and Am, string 4 for Dm, and string 6 for G.

::chords{ids="C,Am,Dm,G"}

::exercise{id="arpeggio-p-i-m-i"}

## p-i-m-a-m-i (3/4 and 6/8)

Up to the thinnest string and back: six notes, perfect for waltzes and slow ballads in 3/4 or 6/8.

```atex
\tempo 70
\ts (3 4)
:8 0.5{ch "Am"} 2.3 1.2 0.1 1.2 2.3 | 3.5{ch "C"} 0.3 1.2 0.1 1.2 0.3
```

You'll use this pattern for House of the Rising Sun in the next lesson.

::tool[Metronome in 3/4]{name="metronome" bpm=70 ts="3/4" sub=2}

:::warning
Common mistakes:

- The thumb note louder than everything else. Balance it, or make the top note slightly louder instead.
- Lifting the whole chord too early, so the last notes of the bar cut off.
- Forgetting to move the thumb to the right bass string for each chord.

:::

**Mastery check:** a clean pass of the p-i-m-i exercise at 80 BPM.
