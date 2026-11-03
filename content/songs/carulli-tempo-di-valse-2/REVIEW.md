# Review: Tempo di Valse (Guitar-Skole No. 17)

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1671
- File: https://www.mutopiaproject.org/ftp/CarulliF/guitar-skole-no-17/guitar-skole-no-17.mid (sha256 b4df0a355642…)
- Level 3: frets capped at 5; highest fret used 5
- Octave shift 0 · 32 bars · 144 onsets · 0 notes left out
- Tempo 80 from --tempo
- Mutopia licence: Creative Commons Attribution 4.0
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 212 note-ons match the tab in pitch and onset.
- Source spot-check: bar 1 e''16 b' gis' b' e'', bar 2 and the last bar a4 read against the .ly.
- Signatures: 3/8 and the key as in the .ly; 32 bars.
- Form: |: A :| |: B :| Fine |: C :| |: D :| D.C. al Fine (8 bars each). Marked with \section labels in the tab.
- Fingering: frets 0-5 (Level 3 cap 5), 2 voice(s), at most 4 notes struck together, widest fretted span 2 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 80: Tempo di Valse; no number in the .ly (MIDI 60): set to 80.
- Level 3: E major in first position, frets 0-5; compared with sor-op60-01 and carulli-waltz-op241-01.
- Title and composer from the .ly header and Mutopia page; licence CC BY 4.0 kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 212 tab numbers, none overlapping.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
