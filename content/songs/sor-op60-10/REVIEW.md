# Review: Lesson No. 10, Op. 60

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1750
- File: https://www.mutopiaproject.org/ftp/SorF/O60/sor_op60-10/sor_op60-10.mid (sha256 c7c6388d7090…)
- Level 4: frets capped at 7; highest fret used 3
- Octave shift 0 · 17 bars · 116 onsets · 0 notes left out
- Tempo 80 from the MIDI file (checked: see the notes)
- Mutopia licence: Creative Commons Attribution-ShareAlike 3.0
- Pickup of 4 (--pickup): bar 1 is rests then the pickup
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 121 note-ons match the tab in pitch and onset.
- Source spot-check: bar 1 (pickup g), bar 2 g' e c g and the closing c2 c bass read against the .ly.
- Signatures: 4/4 and the key as in the .ly; 17 bars including the pickup bar (rests, then the pickup).
- Form: |: A (pickup, bars 2-9) :| |: B (10-17) :|. Marked with \section labels in the tab.
- Fingering: frets 0-3 (Level 4 cap 7), 2 voice(s), at most 3 notes struck together, widest fretted span 2 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 80: 80 = the edition's MIDI tempo; no tempo word.
- Level 4: broken-chord accompaniment under a melody, three notes at once, frets 0-3; compared with giuliani-op51-03 and coste-menuett.
- Title and composer from the .ly header and Mutopia page; licence CC BY-SA 3.0 kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 121 tab numbers, none overlapping.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
