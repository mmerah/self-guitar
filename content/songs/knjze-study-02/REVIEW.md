# Review: Progressive Study No. 2

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1059
- File: https://www.mutopiaproject.org/ftp/KnjzeF/SixStudiesB/SixStudiesB.mid (sha256 377136cd818d…)
- Level 3: frets capped at 5; highest fret used 4
- Octave shift -12 · 119 bars · 444 onsets · 0 notes left out
- Tempo 88 from --tempo
- Mutopia licence: Public Domain
- Pickup of 8 (--pickup): bar 1 is rests then the pickup
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 716 note-ons match the tab in pitch and onset.
- Source spot-check: bar 1 (pickup), bar 2 and the closing a4 read against the .ly.
- Signatures: 2/4 and the key as in the .ly; 119 bars including the pickup bar (rests, then the pickup).
- Form: Sections with repeats |: :|, Fine and D.C.: see the source PDF; MIDI plays each once. Marked with \section labels in the tab.
- Fingering: frets 0-4 (Level 3 cap 5), 2 voice(s), at most 4 notes struck together, widest fretted span 2 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 88: Allegretto; set to 88 (the importer took 72 from the MIDI).
- Level 3: first position, frets 0-4, 119 bars; compared with sor-op60-01 and carulli-waltz-op241-01.
- Title and composer from the .ly header and Mutopia page; licence Public Domain kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 716 tab numbers, none overlapping.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
