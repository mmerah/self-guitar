# Review: Andantino, Op. 241 No. 5

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1662
- File: https://www.mutopiaproject.org/ftp/CarulliF/guitar-skole-no-08/guitar-skole-no-08.mid (sha256 bf40b7fd3bc8…)
- Level 3: frets capped at 5; highest fret used 4
- Octave shift 0 · 16 bars · 118 onsets · 0 notes left out
- Tempo 66 from --tempo
- Mutopia licence: Creative Commons Attribution 4.0
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 142 note-ons match the tab in pitch and onset.
- Source spot-check: bar 1 b16 g b g c' g c' g, bar 2 and the last bar read against the .ly.
- Signatures: 2/4 and the key as in the .ly; 16 bars.
- Form: |: A (1-8) :| |: B (9-16) :|. Marked with \section labels in the tab.
- Fingering: frets 0-4 (Level 3 cap 5), 2 voice(s), at most 2 notes struck together, widest fretted span 2 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 66: Andantino; the .ly gives no number (its MIDI fell back to 60): set to 66.
- Level 3: 16th-note broken chords in first position, frets 0-4; compared with sor-op60-01 and carulli-waltz-op241-01.
- Title and composer from the .ly header and Mutopia page; licence CC BY 4.0 kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 142 tab numbers, none overlapping.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
