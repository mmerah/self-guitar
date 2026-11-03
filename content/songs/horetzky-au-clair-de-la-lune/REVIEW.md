# Review: Au clair de la lune

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1111
- File: https://www.mutopiaproject.org/ftp/HoretzkyF/horetzky21/horetzky21.mid (sha256 5fe77a997dff…)
- Level 3: frets capped at 5; highest fret used 5
- Octave shift -12 · 16 bars · 58 onsets · 0 notes left out
- Tempo 84 from --tempo
- Mutopia licence: Public Domain
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 129 note-ons match the tab in pitch and onset.
- Source spot-check: bar 1 <c e,>8 <c e,> <c e,> <d g,>, bar 2 <e g,>4 <d g,>, bars 3-4 c8 e d <d b> / c4 r and the final <c c,>2 read against the .ly (the edition defines segno/Fine marks but never uses them).
- Signatures: 2/4 and the key as in the .ly; 16 bars.
- Form: no repeats or D.C. in the source.
- Fingering: frets 0-5 (Level 3 cap 5), 2 voice(s), at most 4 notes struck together, widest fretted span 3 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 84: Allegretto, dolce; the .ly's MIDI tempo is 60 (default): set to 84.
- Level 3: frets 0-5, three-note chords; compared with sor-op60-01 and carulli-waltz-op241-01.
- Title and composer from the .ly header and Mutopia page; licence Public Domain kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 129 tab numbers, none overlapping.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
