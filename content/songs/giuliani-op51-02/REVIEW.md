# Review: Lesson No. 2, Op. 51

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=2181
- File: https://www.mutopiaproject.org/ftp/GiulianiM/O51/giuliani-o51-02/giuliani-o51-02.mid (sha256 63ebe3ea96c2…)
- Level 3: frets capped at 5; highest fret used 4
- Octave shift 0 · 23 bars · 129 onsets · 0 notes left out
- Tempo 120 from the LilyPond \tempo
- Mutopia licence: Creative Commons Attribution-ShareAlike 4.0
- Pickup of 4 (--pickup): bar 1 is rests then the pickup
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 187 note-ons match the tab in pitch and onset.
- Source spot-check: bar 1 (pickup e' f'), bar 2 g' e' c' b e' d' and the final chord read against the .ly.
- Signatures: 6/8 and the key as in the .ly; 23 bars including the pickup bar (rests, then the pickup).
- Form: no repeats or D.C. in the source.
- Fingering: frets 0-4 (Level 3 cap 5), 2 voice(s), at most 4 notes struck together, widest fretted span 2 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 120: Grazioso, with \tempo 4 = 120 in the .ly.
- Level 3: first position, frets 0-4; compared with sor-op60-01 and carulli-waltz-op241-01.
- Title and composer from the .ly header and Mutopia page; licence CC BY-SA 4.0 kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 187 tab numbers, none overlapping.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
