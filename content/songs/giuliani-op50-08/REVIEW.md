# Review: Allegretto, Op. 50 No. 8

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1336
- File: https://www.mutopiaproject.org/ftp/GiulianiM/O50/giuliani-op50n08/giuliani-op50n08.mid (sha256 bd3e97f8d545…)
- Level 3: frets capped at 5; highest fret used 3
- Octave shift -12 · 23 bars · 128 onsets · 1 notes left out
- Tempo 132 from the MIDI file (checked: see the notes)
- Mutopia licence: Creative Commons Attribution 3.0
- Pickup of 8 (--pickup): bar 1 is rests then the pickup
- Flagged:
  - bar 23: left out 1 inner note(s): more than 4 at once

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): 197 of 198 note-ons match the tab in pitch and onset; the missing one is explained below.
- Source spot-check: bar 1 (pickup b8), bar 2 c4 a8 r4 a8 and the last bar read against the .ly.
- Signatures: 6/8 and the key as in the .ly; 23 bars including the pickup bar (rests, then the pickup).
- Form: no repeats or D.C. in the source.
- Fingering: frets 0-3 (Level 3 cap 5), 2 voice(s), at most 4 notes struck together, widest fretted span 1 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 132: Allegretto (header 'meter'); 132 = the typesetter's MIDI tempo (6/8).
- Level 3: first position, frets 0-3; compared with sor-op60-01 and carulli-waltz-op241-01.
- Title and composer from the .ly header and Mutopia page; licence CC BY 3.0 kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 197 tab numbers, none overlapping.
- Known issue: The final 5-note G chord is thinned to 4 notes (L3 cap): the inner B is left out.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
