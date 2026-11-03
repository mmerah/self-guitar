# Warm-up routines (M5)

26 original routines, each 2–5 minutes. All tab is our own (CC0). Fingers are 1 index … 4 pinky; the right hand is p-i-m-a.

Format: each routine maps onto the existing exercise `meta.json` (`id`, `title`, `howTo` = steps, `chords`, `strum`, `startBpm`, `targetBpm`, `step: 4`, `cleanReps: 3`) plus `score.atex`.

Every `atex` block below was run through the repo's own `checkAlphaTex` (`src/lib/content/alphatex.ts`): no diagnostics, and all bars add up. The validated files, with headers, are in `warmups-atex/`, and the data is in `warmups-atex/warmups.json`.

- Each `startBpm` is about 60–65 % of its `targetBpm`.
- Routines marked **[L5]** are previews for Level 5 (blues & lead). Keep them hidden until L5 ships.
- Ids are new: none collides with `content/exercises/*`. `chromatic-warm-up` and `arpeggio-p-i-m-i` already exist, so these are variations on them.

Suggested daily sets (5 min): **L0–1** = hand-stretches → spider-1234-shift → changes-em-am-drill → strum-quarters-to-eighths. **L2** = spider-1324 → chromatic-ladder-g → strum-d-du-udu-build → mute-chuck. **L3** = spider-diagonal → pima-p-i-m-a-m-i → hammer-pull-fretted.

| #   | id                          | Level | Min | Covers              | BPM    |
| --- | --------------------------- | ----- | --- | ------------------- | ------ |
| 1   | `spider-1234-shift`         | L1    | 3   | finger independence | 50→80  |
| 2   | `spider-1324`               | L1    | 2   | finger independence | 45→72  |
| 3   | `spider-string-pairs`       | L2    | 3   | finger independence | 50→84  |
| 4   | `spider-diagonal`           | L2    | 2   | finger independence | 40→70  |
| 5   | `hand-stretches`            | L0    | 2   | stretch             | timed  |
| 6   | `chromatic-ladder-g`        | L2    | 3   | chromatic           | 50→90  |
| 7   | `chromatic-sixteenths`      | L2    | 3   | chromatic           | 40→80  |
| 8   | `changes-em-am-drill`       | L1    | 2   | chord changes       | 50→80  |
| 9   | `changes-g-cadd9-d-anchor`  | L1    | 3   | chord changes       | 50→84  |
| 10  | `changes-a-d-e-cycle`       | L1    | 2   | chord changes       | 50→80  |
| 11  | `changes-dm-am-e`           | L2    | 2   | chord changes       | 50→80  |
| 12  | `strum-quarters-to-eighths` | L1    | 3   | strum groove        | 60→90  |
| 13  | `strum-d-du-udu-build`      | L2    | 3   | strum groove        | 55→90  |
| 14  | `strum-reggae-skank`        | L2    | 2   | strum groove        | 60→90  |
| 15  | `strum-waltz`               | L1    | 2   | strum groove        | 60→100 |
| 16  | `strum-six-eight`           | L2    | 2   | strum groove        | 50→80  |
| 17  | `pent-box1-am`              | L5    | 3   | pentatonic [L5]     | 60→100 |
| 18  | `pent-threes-am`            | L5    | 3   | pentatonic [L5]     | 50→90  |
| 19  | `pima-p-i-m-a-m-i`          | L3    | 3   | fingerpicking       | 60→96  |
| 20  | `pima-pinch-alternating`    | L3    | 3   | fingerpicking       | 55→90  |
| 21  | `hammer-pull-open`          | L2    | 2   | hammer/pull         | 60→100 |
| 22  | `hammer-pull-fretted`       | L3    | 3   | hammer/pull         | 50→90  |
| 23  | `hammer-dsus2-d`            | L3    | 2   | hammer/pull         | 60→90  |
| 24  | `mute-chuck`                | L2    | 2   | muting              | 55→90  |
| 25  | `mute-palm-chug`            | L2    | 2   | muting              | 60→110 |
| 26  | `mute-unused-strings`       | L2    | 2   | muting              | 60→90  |

## 1. Spider 1-2-3-4, shifting (`spider-1234-shift`)

- **Goal:** Finger independence and clean position shifts.
- **Level:** 1 · **Time:** 3 min · **BPM:** 50 → 80 (step 4)
- **Steps (28 words):** One finger per fret. Climb 1-2-3-4 from low E to high e at fret 1, slide up one fret, then descend 4-3-2-1. Keep fingers close to the strings.

```atex
\tempo 80
\ts (4 4)
:8 1.6 2.6 3.6 4.6 1.5 2.5 3.5 4.5 | 1.4 2.4 3.4 4.4 1.3 2.3 3.3 4.3 | 1.2 2.2 3.2 4.2 1.1 2.1 3.1 4.1 |
:8 5.1 4.1 3.1 2.1 5.2 4.2 3.2 2.2 | 5.3 4.3 3.3 2.3 5.4 4.4 3.4 2.4 | 5.5 4.5 3.5 2.5 5.6 4.6 3.6 2.6
```

## 2. Spider 1-3-2-4 (`spider-1324`)

- **Goal:** Break the 1-2-3-4 habit; independent ring and middle fingers.
- **Level:** 1 · **Time:** 2 min · **BPM:** 45 → 72 (step 4)
- **Steps (23 words):** Frets 1-3-2-4 with fingers 1-3-2-4 on each string, low E to high e. Alternate pick. Leave finger 1 down while the others move.

```atex
\tempo 72
\ts (4 4)
:8 1.6 3.6 2.6 4.6 1.5 3.5 2.5 4.5 | 1.4 3.4 2.4 4.4 1.3 3.3 2.3 4.3 | 1.2 3.2 2.2 4.2 1.1 3.1 2.1 4.1
```

## 3. Spider pairs across strings (`spider-string-pairs`)

- **Goal:** Fingers 1-2 and 3-4 work on different strings (string crossing).
- **Level:** 2 · **Time:** 3 min · **BPM:** 50 → 84 (step 4)
- **Steps (24 words):** At fret 5: fingers 1-2 on one string, 3-4 on the next string up. Move up a string each group, then come back down.

```atex
\tempo 84
\ts (4 4)
:8 5.6 6.6 7.5 8.5 5.5 6.5 7.4 8.4 | 5.4 6.4 7.3 8.3 5.3 6.3 7.2 8.2 | 5.2 6.2 7.1 8.1 8.1 7.1 6.2 5.2 | 8.2 7.2 6.3 5.3 8.3 7.3 6.4 5.4 | 8.4 7.4 6.5 5.5 8.5 7.5 6.6 5.6
```

## 4. Diagonal spider (`spider-diagonal`)

- **Goal:** Each finger on its own string: true independence.
- **Level:** 2 · **Time:** 2 min · **BPM:** 40 → 70 (step 4)
- **Steps (27 words):** Fret 5, finger 1 on low E; fingers 2, 3, 4 each one fret and one string higher. Walk the diagonal up and back. Slow and clean.

```atex
\tempo 70
\ts (4 4)
:8 5.6 6.5 7.4 8.3 5.5 6.4 7.3 8.2 | 5.4 6.3 7.2 8.1 8.1 7.2 6.3 5.4 | 8.2 7.3 6.4 5.5 8.3 7.4 6.5 5.6
```

## 5. Two-minute hand stretch (`hand-stretches`)

- **Goal:** Loosen wrists and fingers before playing (no instrument).
- **Level:** 0 · **Time:** 2 min
- **Steps (25 words):** Shake hands loose 15 s. Gentle wrist flex and extend 15 s each. Spread and close fingers 10 times. Thumb circles. Never push into pain.
- **Timed (no tab):** 0:00 shake out · 0:15 wrist flex (palm up, other hand eases fingers down) · 0:30 wrist extend · 0:45 finger spread/close ×10 · 1:15 thumb circles ×5 each way · 1:30 make loose fists, open slowly ×5 · 2:00 done

## 6. Chromatic ladder on the G string (`chromatic-ladder-g`)

- **Goal:** Shift by one fret while keeping one finger per fret.
- **Level:** 2 · **Time:** 3 min · **BPM:** 50 → 90 (step 4)
- **Steps (22 words):** On the G string: 1-2-3-4, then shift up a fret and repeat, up to frets 4-7. Come back down 4-3-2-1. Fingers 1-2-3-4.

```atex
\tempo 90
\ts (4 4)
:8 1.3 2.3 3.3 4.3 2.3 3.3 4.3 5.3 | 3.3 4.3 5.3 6.3 4.3 5.3 6.3 7.3 | 7.3 6.3 5.3 4.3 6.3 5.3 4.3 3.3 | 5.3 4.3 3.3 2.3 4.3 3.3 2.3 1.3
```

## 7. Chromatic run in sixteenths (`chromatic-sixteenths`)

- **Goal:** Strict alternate picking, synced with the fretting hand.
- **Level:** 2 · **Time:** 3 min · **BPM:** 40 → 80 (step 4)
- **Steps (21 words):** Frets 1-2-3-4 on every string, four notes per beat. Strict down-up picking. Up from low E to high e, then down.

```atex
\tempo 80
\ts (4 4)
:16 1.6{sd} 2.6{su} 3.6{sd} 4.6{su} 1.5 2.5 3.5 4.5 1.4 2.4 3.4 4.4 1.3 2.3 3.3 4.3 | 1.2 2.2 3.2 4.2 1.1 2.1 3.1 4.1 4.1 3.1 2.1 1.1 4.2 3.2 2.2 1.2 | 4.3 3.3 2.3 1.3 4.4 3.4 2.4 1.4 4.5 3.5 2.5 1.5 4.6 3.6 2.6 1.6
```

## 8. Em ↔ Am change drill (`changes-em-am-drill`)

- **Goal:** Fast, quiet switch of the two-finger shapes.
- **Level:** 1 · **Time:** 2 min · **BPM:** 50 → 80 (step 4)
- **Chords:** Em, Am
- **Steps (25 words):** Em two beats, Am two beats, down-strums. Fingers 2 and 3 move across together as one block. Keep strumming even if the change is late.
- **Strum:** `::strum{pattern="D - D - D - D -" bpm=50}`

```atex
\tempo 80
\ts (4 4)
:4 (0.6 2.5 2.4 0.3 0.2 0.1){ch "Em"} (0.6 2.5 2.4 0.3 0.2 0.1) (0.5 2.4 2.3 1.2 0.1){ch "Am"} (0.5 2.4 2.3 1.2 0.1) | (0.6 2.5 2.4 0.3 0.2 0.1){ch "Em"} (0.6 2.5 2.4 0.3 0.2 0.1) (0.5 2.4 2.3 1.2 0.1){ch "Am"} (0.5 2.4 2.3 1.2 0.1)
```

## 9. G – Cadd9 – D with an anchor finger (`changes-g-cadd9-d-anchor`)

- **Goal:** Use a pivot finger to make changes fast.
- **Level:** 1 · **Time:** 3 min · **BPM:** 50 → 84 (step 4)
- **Chords:** G, Cadd9, D
- **Steps (26 words):** G (320033), Cadd9 and D: one bar each. Ring finger stays on fret 3 of the B string the whole time. Only the other fingers move.
- **Strum:** `::strum{pattern="D - D - D - D U" bpm=50}`

```atex
\tempo 84
\ts (4 4)
:4 (3.6 2.5 0.4 0.3 3.2 3.1){ch "G"} (3.6 2.5 0.4 0.3 3.2 3.1) (3.6 2.5 0.4 0.3 3.2 3.1) (3.6 2.5 0.4 0.3 3.2 3.1) | (3.5 2.4 0.3 3.2 3.1){ch "Cadd9"} (3.5 2.4 0.3 3.2 3.1) (3.5 2.4 0.3 3.2 3.1) (3.5 2.4 0.3 3.2 3.1) | (0.4 2.3 3.2 2.1){ch "D"} (0.4 2.3 3.2 2.1) (0.4 2.3 3.2 2.1) (0.4 2.3 3.2 2.1) | (3.6 2.5 0.4 0.3 3.2 3.1){ch "G"} (3.6 2.5 0.4 0.3 3.2 3.1) (3.6 2.5 0.4 0.3 3.2 3.1) (3.6 2.5 0.4 0.3 3.2 3.1)
```

## 10. A – D – E cycle (`changes-a-d-e-cycle`)

- **Goal:** The I–IV–V shapes of A, in time.
- **Level:** 1 · **Time:** 2 min · **BPM:** 50 → 80 (step 4)
- **Chords:** A, D, E
- **Steps (20 words):** A and D for two beats each, then E and A. Half-note strums. Lift all fingers together, land them together.

```atex
\tempo 80
\ts (4 4)
:2 (0.5 2.4 2.3 2.2 0.1){ch "A"} (0.4 2.3 3.2 2.1){ch "D"} | (0.6 2.5 2.4 1.3 0.2 0.1){ch "E"} (0.5 2.4 2.3 2.2 0.1){ch "A"}
```

## 11. Dm – Am – E minor-key drill (`changes-dm-am-e`)

- **Goal:** The changes of a minor-key song (Wayfaring Stranger, Santiana).
- **Level:** 2 · **Time:** 2 min · **BPM:** 50 → 80 (step 4)
- **Chords:** Am, Dm, E
- **Steps (21 words):** Am, Dm, E, Am: one bar each, D - D U - U D U. Index finger leads the Am-to-Dm change.
- **Strum:** `::strum{pattern="D - D U - U D U" bpm=50}`

```atex
\tempo 80
\ts (4 4)
:4 (0.5 2.4 2.3 1.2 0.1){ch "Am"} :8 (0.5 2.4 2.3 1.2 0.1) :4 (2.3 1.2 0.1) :8 (2.3 1.2 0.1) (0.5 2.4 2.3 1.2 0.1) (2.3 1.2 0.1) | :4 (0.4 2.3 3.2 1.1){ch "Dm"} (0.4 2.3 3.2 1.1) (0.4 2.3 3.2 1.1) (0.4 2.3 3.2 1.1) | (0.6 2.5 2.4 1.3 0.2 0.1){ch "E"} (0.6 2.5 2.4 1.3 0.2 0.1) (0.6 2.5 2.4 1.3 0.2 0.1) (0.6 2.5 2.4 1.3 0.2 0.1) | :1 (0.5 2.4 2.3 1.2 0.1){ch "Am"}
```

## 12. Quarters → eighths (`strum-quarters-to-eighths`)

- **Goal:** Keep the strumming hand moving down-up like a pendulum.
- **Level:** 1 · **Time:** 3 min · **BPM:** 60 → 90 (step 4)
- **Chords:** G
- **Steps (22 words):** One chord (G). Play 1 minute of each pattern in turn. The hand never stops: down on the numbers, up on "and".
- **Strum:** `::strum{pattern="D - D - D - D -" bpm=60}` → `::strum{pattern="D - D U D - D U" bpm=60}` → `::strum{pattern="D U D U D U D U" bpm=60}`

## 13. Build D - DU - UDU (`strum-d-du-udu-build`)

- **Goal:** Assemble the most common folk pattern in three steps.
- **Level:** 2 · **Time:** 3 min · **BPM:** 55 → 90 (step 4)
- **Chords:** G
- **Steps (25 words):** Em or G. Step 1, then 2, then 3, each 8 bars. Beat 3 is a miss: the hand passes down without touching the strings.
- **Strum:** `::strum{pattern="D - D - - - D -" bpm=55}` → `::strum{pattern="D - D U - - D U" bpm=55}` → `::strum{pattern="D - D U - U D U" bpm=55}`

## 14. Skank on the off-beats (`strum-reggae-skank`)

- **Goal:** Off-beat feel and a short, choked chord.
- **Level:** 2 · **Time:** 2 min · **BPM:** 60 → 90 (step 4)
- **Chords:** Am
- **Steps (25 words):** Am or Dm on the top 3–4 strings. Miss on the beat, short down-chop on every "and". Release the left hand right after each chop.
- **Strum:** `::strum{pattern="- D - D - D - D" bpm=60}`

```atex
\tempo 90
\ts (4 4)
:8 r (2.3 1.2 0.1){bd} r (2.3 1.2 0.1){bd} r (2.3 1.2 0.1){bd} r (2.3 1.2 0.1){bd} | r (2.3 3.2 1.1){bd} r (2.3 3.2 1.1){bd} r (2.3 3.2 1.1){bd} r (2.3 3.2 1.1){bd}
```

## 15. Waltz strum in 3/4 (`strum-waltz`)

- **Goal:** Count and feel 3/4 (Clementine, Streets of Laredo).
- **Level:** 1 · **Time:** 2 min · **BPM:** 60 → 100 (step 4)
- **Chords:** G, D
- **Steps (23 words):** G then D, one bar each. First D - D - D -, then D - D U D U. Accent beat 1.
- **Strum:** `::strum{pattern="D - D - D -" bpm=60}` → `::strum{pattern="D - D U D U" bpm=60}`

## 16. 6/8 shanty strum (`strum-six-eight`)

- **Goal:** Two big beats per bar, each split in three.
- **Level:** 2 · **Time:** 2 min · **BPM:** 50 → 80 (step 4)
- **Chords:** Em, D
- **Steps (25 words):** Em then D. Count 1-2-3-4-5-6, accents on 1 and 4. Start D - - D - -, then play D - U D - U.
- **Strum:** `::strum{pattern="D - - D - -" bpm=50}` → `::strum{pattern="D - U D - U" bpm=50}`

```atex
\tempo 80
\ts (6 8)
:8 (0.6 2.5 2.4 0.3 0.2 0.1){ch "Em"} r (0.3 0.2 0.1){bu} (0.6 2.5 2.4 0.3 0.2 0.1) r (0.3 0.2 0.1){bu} | (0.4 2.3 3.2 2.1){ch "D"} r (2.3 3.2 2.1){bu} (0.4 2.3 3.2 2.1) r (2.3 3.2 2.1){bu}
```

## 17. A minor pentatonic, box 1 [L5] (`pent-box1-am`)

- **Goal:** Level 5 preview: the first lead shape.
- **Level:** 5 · **Time:** 3 min · **BPM:** 60 → 100 (step 4)
- **Steps (23 words):** Fret 5: fingers 1 and 4 on E strings and B, 1 and 3 on A, D, G. Up and down, alternate picking.

```atex
\tempo 100
\ts (4 4)
:8 5.6 8.6 5.5 7.5 5.4 7.4 5.3 7.3 | 5.2 8.2 5.1 8.1 8.1 5.1 8.2 5.2 | 7.3 5.3 7.4 5.4 7.5 5.5 8.6 5.6
```

## 18. Pentatonic in groups of three [L5] (`pent-threes-am`)

- **Goal:** Level 5 preview: a sequence that frees improvisation.
- **Level:** 5 · **Time:** 3 min · **BPM:** 50 → 90 (step 4)
- **Steps (15 words):** Box 1, play three notes up, then start again one note higher. Counted in 3/4.

```atex
\tempo 90
\ts (3 4)
:8 5.6 8.6 5.5 8.6 5.5 7.5 | 5.5 7.5 5.4 7.5 5.4 7.4 | 5.4 7.4 5.3 7.4 5.3 7.3 | 5.3 7.3 5.2 7.3 5.2 8.2 | 5.2 8.2 5.1 8.2 5.1 8.1
```

## 19. p-i-m-a-m-i arpeggio (`pima-p-i-m-a-m-i`)

- **Goal:** Even right-hand fingers rolling up and back.
- **Level:** 3 · **Time:** 3 min · **BPM:** 60 → 96 (step 4)
- **Chords:** Am, C, G, Em
- **Steps (27 words):** Am, C, G, Em: one bar each in 3/4. Thumb plays the bass, i plays G, m plays B, a plays high e, then m and i.

```atex
\tempo 96
\ts (3 4)
:8 0.5{ch "Am"} 2.3 1.2 0.1 1.2 2.3 | 3.5{ch "C"} 0.3 1.2 0.1 1.2 0.3 | 3.6{ch "G"} 0.3 0.2 3.1 0.2 0.3 | 0.6{ch "Em"} 0.3 0.2 0.1 0.2 0.3
```

## 20. Pinch and alternating thumb (`pima-pinch-alternating`)

- **Goal:** Thumb independence: p alternates while a pinches the melody.
- **Level:** 3 · **Time:** 3 min · **BPM:** 55 → 90 (step 4)
- **Chords:** C, D
- **Steps (23 words):** C, then D. On beats 1 and 3: pinch thumb + a. In between i and m. Thumb alternates strings 5 and 4.

```atex
\tempo 90
\ts (4 4)
:8 (3.5 0.1){ch "C"} 0.3 1.2 0.3 (2.4 0.1) 0.3 1.2 0.3 | (0.4 2.1){ch "D"} 2.3 3.2 2.3 (0.4 2.1) 2.3 3.2 2.3
```

## 21. Open-string hammer-ons and pull-offs (`hammer-pull-open`)

- **Goal:** Strong, in-time legato from open strings.
- **Level:** 2 · **Time:** 2 min · **BPM:** 60 → 100 (step 4)
- **Steps (24 words):** Pick the open string, hammer finger 2 onto fret 2. Then pick fret 2 and pull off to open. G string, then B string.

```atex
\tempo 100
\ts (4 4)
:8 0.3{h} 2.3 0.3{h} 2.3 2.3{h} 0.3 2.3{h} 0.3 | 0.2{h} 2.2 0.2{h} 2.2 2.2{h} 0.2 2.2{h} 0.2
```

## 22. Fretted hammer/pull pairs (`hammer-pull-fretted`)

- **Goal:** Hammer-ons and pull-offs with every finger pair.
- **Level:** 3 · **Time:** 3 min · **BPM:** 50 → 90 (step 4)
- **Steps (20 words):** Fret 5, finger 1 stays down. Hammer 1-3 then pull 3-1. Then 1-4 and 4-1. G string, then B string.

```atex
\tempo 90
\ts (4 4)
:8 5.3{h} 7.3 7.3{h} 5.3 5.3{h} 8.3 8.3{h} 5.3 | 5.2{h} 7.2 7.2{h} 5.2 5.2{h} 8.2 8.2{h} 5.2
```

## 23. Dsus2 – D hammer embellishment (`hammer-dsus2-d`)

- **Goal:** Folk chord decoration (hammer and pull inside a chord).
- **Level:** 3 · **Time:** 2 min · **BPM:** 60 → 90 (step 4)
- **Chords:** D, Dsus2
- **Steps (20 words):** Strum D with high e open (Dsus2), hammer finger 2 to fret 2, strum D, pull off back to open.

```atex
\tempo 90
\ts (4 4)
:4 (0.4 2.3 3.2 0.1){ch "Dsus2"} :8 0.1{h} 2.1 :4 (0.4 2.3 3.2 2.1){ch "D"} :8 2.1{h} 0.1
```

## 24. Left-hand chuck (`mute-chuck`)

- **Goal:** Percussive muted strum on the backbeat.
- **Level:** 2 · **Time:** 2 min · **BPM:** 55 → 90 (step 4)
- **Chords:** G
- **Steps (26 words):** Hold G. D - X U - U X U: on each X, release left-hand pressure (fingers stay on the strings) and strum the dead strings.
- **Strum:** `::strum{pattern="D - D U - U D U" bpm=55 chord="G"}`. The downs on slots 3 and 7 are the chuck.

```atex
\tempo 90
\ts (4 4)
:4 (3.6 2.5 0.4 0.3 3.2 3.1){bd ch "G"} :8 (x.6 x.5 x.4 x.3 x.2 x.1){bd} :4 (0.3 3.2 3.1){bu} :8 (0.3 3.2 3.1){bu} :8 (x.6 x.5 x.4 x.3 x.2 x.1){bd} :8 (0.3 3.2 3.1){bu}
```

## 25. Palm-mute chug (`mute-palm-chug`)

- **Goal:** Control sustain with the strumming hand.
- **Level:** 2 · **Time:** 2 min · **BPM:** 60 → 110 (step 4)
- **Steps (24 words):** Rest the picking-hand edge on the bridge saddles. Chug muted low E in eighths. Lift the palm for the open E5 on beat 3.

```atex
\tempo 110
\ts (4 4)
:8 0.6{pm} 0.6{pm} 0.6{pm} 0.6{pm} :4 (0.6 2.5 2.4) :8 0.6{pm} 0.6{pm} | 0.5{pm} 0.5{pm} 0.5{pm} 0.5{pm} :4 (0.5 2.4 2.3) :8 0.5{pm} 0.5{pm}
```

## 26. Mute what you don't play (`mute-unused-strings`)

- **Goal:** Clean D and C chords without ringing bass strings.
- **Level:** 2 · **Time:** 2 min · **BPM:** 60 → 90 (step 4)
- **Chords:** D, C
- **Steps (22 words):** D chord: thumb tip lightly touches low E, fretting finger tips lean on A. Strum all six strings: only four may sound.
- **Strum:** `::strum{pattern="D - D U - U D U" bpm=60}`

```atex
\tempo 90
\ts (4 4)
:4 (x.6 x.5 0.4 2.3 3.2 2.1){ch "D"} (x.6 x.5 0.4 2.3 3.2 2.1) (x.6 x.5 0.4 2.3 3.2 2.1) (x.6 x.5 0.4 2.3 3.2 2.1) | (x.6 3.5 2.4 0.3 1.2 0.1){ch "C"} (x.6 3.5 2.4 0.3 1.2 0.1) (x.6 3.5 2.4 0.3 1.2 0.1) (x.6 3.5 2.4 0.3 1.2 0.1)
```
