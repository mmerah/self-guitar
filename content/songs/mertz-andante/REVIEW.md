# Review: Andante (Guitar-Skole No. 4)

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1658
- File: https://www.mutopiaproject.org/ftp/MertzJK/guitar-skole-no-04/guitar-skole-no-04.mid (sha256 b5d0766978a6…)
- Level 4: frets capped at 7; highest fret used 6
- Octave shift 0 · 16 bars · 37 onsets · 0 notes left out
- Tempo 76 from --tempo
- Mutopia licence: Creative Commons Attribution 3.0
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 82 note-ons match the tab in pitch and onset.
- Source spot-check: bar 1 e''2 f''4 over the A-minor chord, bar 2 and the last bar a'2 read against the .ly.
- Signatures: 3/4 and the key as in the .ly; 16 bars.
- Form: A (1-8) once, |: B (9-16) :|. Marked with \section labels in the tab.
- Fingering: frets 0-6 (Level 4 cap 7), 2 voice(s), at most 4 notes struck together, widest fretted span 3 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 76: Andante; the .ly's 4=160 is far too fast: set to 76.
- Level 4: four-note chords, frets 0-6: L4; compared with giuliani-op51-03 and coste-menuett.
- Title and composer from the .ly header and Mutopia page; licence CC BY 3.0 kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 82 tab numbers, none overlapping.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
