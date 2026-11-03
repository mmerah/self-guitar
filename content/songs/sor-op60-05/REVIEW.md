# Review: Lesson No. 5, Op. 60

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=673
- File: https://www.mutopiaproject.org/ftp/SorF/O60/sor_op60-05/sor_op60-05.mid (sha256 b3b09e20d68a…)
- Level 3: frets capped at 5; highest fret used 5
- Octave shift 0 · 40 bars · 208 onsets · 0 notes left out
- Tempo 80 from the LilyPond \tempo
- Mutopia licence: Creative Commons Attribution-ShareAlike 3.0
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 211 note-ons match the tab in pitch and onset.
- Source spot-check: bar 1 bass a2. with a8 a' b c d e, the key change to A major at bar 17 and the last bar read against the .ly.
- Signatures: 6/8 and the key as in the .ly; 40 bars.
- Form: |: A :| |: B :| Fine |: C :| |: D :| D.S. al Fine (segno at bar 1). Marked with \section labels in the tab.
- Fingering: frets 0-5 (Level 3 cap 5), 2 voice(s), at most 2 notes struck together, widest fretted span 3 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 80: 80 = the edition's MIDI tempo (quarter = 80, dotted quarter about 53); no tempo word.
- Level 3: melody over held open basses, frets 0-5; compared with sor-op60-01 and carulli-waltz-op241-01.
- Title and composer from the .ly header and Mutopia page; licence CC BY-SA 3.0 kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 216 tab numbers, none overlapping.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
