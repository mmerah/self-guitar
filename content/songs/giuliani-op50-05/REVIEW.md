# Review: Allegretto, Op. 50 No. 5

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1333
- File: https://www.mutopiaproject.org/ftp/GiulianiM/O50/giuliani-op50n05/giuliani-op50n05.mid (sha256 24a2f82b89b4…)
- Level 4: frets capped at 7; highest fret used 6
- Octave shift -12 · 23 bars · 165 onsets · 0 notes left out
- Tempo 132 from the MIDI file (checked: see the notes)
- Mutopia licence: Creative Commons Attribution 3.0
- Pickup of 8 (--pickup): bar 1 is rests then the pickup
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 182 note-ons match the tab in pitch and onset.
- Source spot-check: bar 1 (pickup e8), bar 2 a4 a16 c b a over the A-minor arpeggio and the last bar read against the .ly.
- Signatures: 2/4 and the key as in the .ly; 23 bars including the pickup bar (rests, then the pickup).
- Form: no repeats or D.C. in the source.
- Fingering: frets 0-6 (Level 4 cap 7), 2 voice(s), at most 3 notes struck together, widest fretted span 3 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 132: Allegretto (header 'meter'); 132 = the typesetter's MIDI tempo.
- Level 4: one note at fret 6 (E above the 5-fret L3 cap) and 16th figures: L4; compared with giuliani-op51-03 and coste-menuett.
- Title and composer from the .ly header and Mutopia page; licence CC BY 3.0 kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 182 tab numbers, none overlapping.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
