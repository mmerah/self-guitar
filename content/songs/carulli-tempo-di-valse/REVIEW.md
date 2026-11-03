# Review: Tempo di Valse (Guitar-Skole No. 11)

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1665
- File: https://www.mutopiaproject.org/ftp/CarulliF/guitar-skole-no-11/guitar-skole-no-11.mid (sha256 5b0078929bea…)
- Level 3: frets capped at 5; highest fret used 3
- Octave shift 0 · 25 bars · 89 onsets · 0 notes left out
- Tempo 80 from --tempo
- Mutopia licence: Creative Commons Attribution 4.0
- Pickup of 8 (--pickup): bar 1 is rests then the pickup
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 128 note-ons match the tab in pitch and onset.
- Source spot-check: bar 1 (pickup a8), bar 2 a16 d' fis'8 d' and the last bar read against the .ly.
- Signatures: 3/8 and the key as in the .ly; 25 bars including the pickup bar (rests, then the pickup).
- Form: |: A (pickup, bars 2-9) :| |: B (10-25) :|. Marked with \section labels in the tab.
- Fingering: frets 0-3 (Level 3 cap 5), 2 voice(s), at most 3 notes struck together, widest fretted span 1 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 80: Tempo di Valse; no number in the .ly (MIDI 60): set to 80 (dotted quarter about 53).
- Level 3: first position, frets 0-3; compared with sor-op60-01 and carulli-waltz-op241-01.
- Title and composer from the .ly header and Mutopia page; licence CC BY 4.0 kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 128 tab numbers, none overlapping.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
