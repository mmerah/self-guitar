# Review: Lesson No. 4, Op. 51

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=2183
- File: https://www.mutopiaproject.org/ftp/GiulianiM/O51/giuliani-o51-04/giuliani-o51-04.mid (sha256 21f1a4eedafd…)
- Level 4: frets capped at 7; highest fret used 5
- Octave shift 0 · 20 bars · 153 onsets · 0 notes left out
- Tempo 110 from the LilyPond \tempo
- Mutopia licence: Creative Commons Attribution-ShareAlike 4.0
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 204 note-ons match the tab in pitch and onset.
- Source spot-check: bar 1 d'2 e', bar 2 d'2 e'8 d' c' b and the final G chord read against the .ly.
- Signatures: 4/4 and the key as in the .ly; 20 bars.
- Form: no repeats or D.C. in the source.
- Fingering: frets 0-5 (Level 4 cap 7), 2 voice(s), at most 4 notes struck together, widest fretted span 3 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 110: Maestoso, with \tempo 4 = 110 in the .ly.
- Level 4: melody over a running 8th middle voice, frets 0-5: L4; compared with giuliani-op51-03 and coste-menuett.
- Title and composer from the .ly header and Mutopia page; licence CC BY-SA 4.0 kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 204 tab numbers, none overlapping.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
