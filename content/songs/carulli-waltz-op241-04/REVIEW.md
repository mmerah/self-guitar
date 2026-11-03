# Review: Waltz, Op. 241 No. 4

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1660
- File: https://www.mutopiaproject.org/ftp/CarulliF/guitar-skole-no-06/guitar-skole-no-06.mid (sha256 993f2fee33f5…)
- Level 3: frets capped at 5; highest fret used 4
- Octave shift 0 · 32 bars · 88 onsets · 0 notes left out
- Tempo 100 from the MIDI file (checked: see the notes)
- Mutopia licence: Creative Commons Attribution 4.0
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 101 note-ons match the tab in pitch and onset.
- Source spot-check: bar 1, bar 9 d8 fis' c' (section B) and the last bar <g b e> read against the .ly.
- Signatures: 3/8 and the key as in the .ly; 32 bars.
- Form: |: A :| |: B :| Fine |: C :| |: D :| D.C. al Fine (8 bars each). Marked with \section labels in the tab.
- Fingering: frets 0-4 (Level 3 cap 5), 2 voice(s), at most 4 notes struck together, widest fretted span 2 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 100: Allegretto 4=100 in the .ly.
- Level 3: first position, frets 0-4; compared with sor-op60-01 and carulli-waltz-op241-01.
- Title and composer from the .ly header and Mutopia page; licence CC BY 4.0 kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 101 tab numbers, none overlapping.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
