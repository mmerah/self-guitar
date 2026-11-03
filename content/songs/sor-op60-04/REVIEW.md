# Review: Lesson No. 4, Op. 60

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=672
- File: https://www.mutopiaproject.org/ftp/SorF/O60/sor_op60-04/sor_op60-04.mid (sha256 9e3fd0410748…)
- Level 3: frets capped at 5; highest fret used 4
- Octave shift 0 · 25 bars · 107 onsets · 0 notes left out
- Tempo 88 from --tempo
- Mutopia licence: Creative Commons Attribution-ShareAlike 2.5
- Pickup of 4 (--pickup): bar 1 is rests then the pickup
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 107 note-ons match the tab in pitch and onset.
- Source spot-check: bar 1 (pickup g), bar 2 ees8. d16 c4 c' and the last bar c c, r read against the .ly.
- Signatures: 3/4 and the key as in the .ly; 25 bars including the pickup bar (rests, then the pickup).
- Form: |: A (pickup, bars 2-9) :| |: B (10-25) :|. MIDI plays each once. Marked with \section labels in the tab.
- Fingering: frets 0-4 (Level 3 cap 5), 1 voice(s), at most 1 notes struck together, widest fretted span 0 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 88: no marking; MIDI 160 is a default: set to 88 for the dotted rhythms.
- Level 3: single line, frets 0-4, E-flat major accidentals in first position; compared with sor-op60-01 and carulli-waltz-op241-01.
- Title and composer from the .ly header and Mutopia page; licence CC BY-SA 2.5 kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 107 tab numbers, none overlapping.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
