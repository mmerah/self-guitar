---
id: reading-tab-and-diagrams
title: Reading tab and chord diagrams
level: 0
unit: reading
skills: [read-tab, read-chord-diagrams]
prereqs: [meet-your-guitar]
minutes: 8
mastery:
  type: self
  items:
    - In tab, I can tell which string and fret each number means
    - I can play the three notes of the first tab example slowly
    - In a chord diagram, I can tell which strings are open, muted and fretted
---

Almost everything in this app is written in two pictures: **tab** for notes and **chord diagrams** for chords. Both are maps of the fretboard, so they're quick to learn.

## How to practise this

- 3 minutes: play the first tab example slowly, saying the string and fret of each note.
- 2 minutes: read the Em diagram aloud ("string 5, fret 2, middle finger…"), then place the fingers.
- 2 minutes: do the same with G, C and D, just reading, without strumming.

## Tab

Tab has six lines, one per string. The **top line is the thinnest string** (high e), the bottom line the thickest. A number tells you which fret to press; **0** means play the string open.

```atex
\tempo 60
:4 0.1 1.1 3.1 r
```

Read it left to right: open high e, then fret 1, then fret 3, then a rest. Press play to hear it, and look at the stems under the numbers: they show the rhythm.

Numbers stacked on top of each other are played together, as a chord:

```atex
\tempo 60
:2 (0.6 2.5 2.4 0.3 0.2 0.1) (0.6 2.5 2.4 0.3 0.2 0.1)
```

## Chord diagrams

A chord diagram is the neck standing upright, as if the guitar faced you. The thick bar at the top is the nut. Vertical lines are strings (thickest on the **left**), horizontal lines are frets.

- A coloured dot is a finger: **1** index, **2** middle, **3** ring, **4** pinky.
- **o** above a string: play it open. **x**: don't play it.

::chord{id="e-m"}

That's Em, the chord you'll strum at the end of Level 0. Tap play to hear it. Here are three chords you'll meet in Level 1:

::chords{ids="g,c,d"}

::tip[The same finger colours are used everywhere in the app, in diagrams and in tab.]
