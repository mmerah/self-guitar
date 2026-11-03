# Review: Preludio

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=380
- File: https://www.mutopiaproject.org/ftp/SanzG/sanz-1/sanz-1.mid (sha256 de53c0df87c0…)
- Level 5: frets capped at 12; highest fret used 10
- Octave shift -12 · 30 bars · 245 onsets · 0 notes left out
- Tempo 120 from the LilyPond \tempo 2 = 60 (half note = 60 → quarter = 120)
- Mutopia licence: Public Domain
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 250 note-ons match the tab in pitch and onset.
- Source spot-check: bar 1 e8 b' g' d, c c' b, a, bars 2-3 (gs8 b' e d a, c' e a,, / b d' g b,, cs e' a cs,,) and the last bar read against the .ly.
- Signatures: 2/2 and the key as in the .ly; 30 bars.
- Form: no repeats or D.C. in the source.
- Fingering: frets 0-10 (Level 5 cap 12), 2 voice(s), at most 4 notes struck together, widest fretted span 4 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 120: Andante poco sostenuto, \tempo 2 = 60 (half note, 2/2) in the .ly = quarter 120. Re-checked in M5 review: earlier set to 100, now the edition's own tempo (the importer now converts the beat unit).
- Level 5: positions up to fret 10 and 4-fret stretches (bar 16): L5; compared with carcassi-op60-01 and bach-prelude-bwv999 (L6, harder).
- Title and composer from the .ly header and Mutopia page; licence Public Domain kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 250 tab numbers, none overlapping.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
