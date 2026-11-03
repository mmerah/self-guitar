---
id: travis-pattern
title: The basic Travis pattern on C, G, Am
level: 3
unit: travis
order: 2
skills: [travis-picking]
prereqs: [alternating-bass]
minutes: 8
mastery: { type: exercise, id: travis-c-g-am, bpm: 70 }
---

Travis picking, named after the country guitarist Merle Travis, puts finger notes between the beats of an alternating thumb. You will build it in three steps, up to C–G–Am at 70 BPM.

## How to practise this

- Build up at 50 BPM: step 1 for a minute, then step 2, then step 3.
- Then the exercise from 46 BPM up to 70, with the metronome on 8ths.
- If it falls apart, go back one step at the same tempo. The thumb must stay steady.
- Review: 1 minute of the alternating-bass exercise.

## Step 1: the thumb

The alternating bass from the last lesson: root on beats 1 and 3, string 4 on beats 2 and 4.

```atex
\tempo 60
:4 3.5{ch "C"} 2.4 3.5 2.4
```

## Step 2: add the pinch

On beat 1, the middle finger (m) plucks string 2 **together** with the thumb. That's called a pinch.

```atex
\tempo 60
:4 (3.5 1.2){ch "C"} 2.4 3.5 2.4
```

## Step 3: fill the "ands"

Now add finger notes between the thumb notes: **i** on string 3 after beat 2, **m** on string 2 after beat 3, **i** on string 3 after beat 4. Count "1 2 & 3 & 4 &".

```atex
\tempo 60
:4 (3.5 1.2){ch "C"} :8 2.4 0.3 3.5 1.2 2.4 0.3
```

The thumb never changes: it plays straight quarter notes. The fingers fall exactly halfway between.

## C – G – Am

Same pattern on each chord; only the thumb's strings change (C: 5 and 4, G: 6 and 4, Am: 5 and 4).

::chords{ids="C,G,Am"}

::exercise{id="travis-c-g-am"}

::tool[Metronome with 8ths]{name="metronome" bpm=60 sub=2}

:::warning
Common mistakes:

- The thumb stopping or stumbling when a finger plays. Practise the thumb until it's automatic first.
- Playing the finger notes together with the thumb instead of in between.
- Rushing: Travis picking sounds best relaxed and even.

:::

**Mastery check:** a clean pass of the Travis exercise on C–G–Am at 70 BPM.
