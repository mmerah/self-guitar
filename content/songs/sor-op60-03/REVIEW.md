# Review: Lesson No. 3, Op. 60

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=671
- File: https://www.mutopiaproject.org/ftp/SorF/O60/sor_op60-03/sor_op60-03.mid (sha256 6f19e9fae019…)
- Level 3: frets capped at 5; highest fret used 4
- Octave shift 0 · 24 bars · 115 onsets · 0 notes left out
- Tempo 100 from --tempo
- Mutopia licence: Creative Commons Attribution-ShareAlike 3.0
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 115 note-ons match the tab in pitch and onset.
- Source spot-check: bar 1 c b c e, bar 12 f e d c and the last bar c c' c r read against the .ly.
- Signatures: 4/4 and the key as in the .ly; 24 bars.
- Form: |: A (bars 1-8) :| |: B (9-24) :|. MIDI plays each once. Marked with \section labels in the tab.
- Fingering: frets 0-4 (Level 3 cap 5), 1 voice(s), at most 1 notes struck together, widest fretted span 0 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 100: the edition has no marking and its MIDI tempo (160) is a default: set to 100.
- Level 3: single line in first position, frets 0-4; compared with sor-op60-01 and carulli-waltz-op241-01.
- Title and composer from the .ly header and Mutopia page; licence CC BY-SA 3.0 kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 115 tab numbers, none overlapping.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
