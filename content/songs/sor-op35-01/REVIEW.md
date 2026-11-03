# Review: Study No. 1, Op. 35

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1849
- File: https://www.mutopiaproject.org/ftp/SorF/O35/sorf_op35_no1/sorf_op35_no1.mid (sha256 c00e88847fec…)
- Level 3: frets capped at 5; highest fret used 3
- Octave shift 0 · 32 bars · 127 onsets · 0 notes left out
- Tempo 80 from --tempo
- Mutopia licence: Creative Commons Attribution-ShareAlike 3.0
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 173 note-ons match the tab in pitch and onset.
- Source spot-check: bar 1 c4 g c e over the bass c, bar 2 g4 e c g and the last bar read against the .ly.
- Signatures: 4/4 and the key as in the .ly; 32 bars.
- Form: no repeats or D.C. in the source.
- Fingering: frets 0-3 (Level 3 cap 5), 2 voice(s), at most 2 notes struck together, widest fretted span 2 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 80: Andante; the .ly's 4 = 180 is far too fast for an Andante in quarters: set to 80.
- Level 3: quarter-note melody over a bass, first position, frets 0-3: L3; compared with sor-op60-01 and carulli-waltz-op241-01.
- Title and composer from the .ly header and Mutopia page; licence CC BY-SA 3.0 kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 175 tab numbers, none overlapping.
- Known issue: Mutopia also has this piece as Guitar-Skole no. 2 (id 1645); only this Op. 35 edition is imported.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
