# Review: Andantino, Op. 50 No. 7

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1335
- File: https://www.mutopiaproject.org/ftp/GiulianiM/O50/giuliani-op50n07/giuliani-op50n07.mid (sha256 b091580dbd32…)
- Level 3: frets capped at 5; highest fret used 5
- Octave shift -12 · 38 bars · 272 onsets · 2 notes left out
- Tempo 104 from the MIDI file (checked: see the notes)
- Mutopia licence: Creative Commons Attribution 3.0
- Pickup of 8 (--pickup): bar 1 is rests then the pickup
- Flagged:
  - bar 38: left out 2 inner note(s): more than 4 at once

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): 338 of 340 note-ons match the tab in pitch and onset; the 2 missing are explained below.
- Source spot-check: bar 1 (pickup b16 c), bar 2 d4 r8 e16 d and the last bar read against the .ly.
- Signatures: 2/4 and the key as in the .ly; 38 bars including the pickup bar (rests, then the pickup).
- Form: no repeats or D.C. in the source.
- Fingering: frets 0-5 (Level 3 cap 5), 2 voice(s), at most 4 notes struck together, widest fretted span 3 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 104: Andantino (header 'meter'); 104 = the typesetter's MIDI tempo.
- Level 3: first position, frets 0-5; compared with sor-op60-01 and carulli-waltz-op241-01.
- Title and composer from the .ly header and Mutopia page; licence CC BY 3.0 kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 338 tab numbers, none overlapping.
- Known issue: The final 6-note G chord is thinned to 4 notes (L3 cap): the inner B and D are left out.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
