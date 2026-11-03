# Review: Prelude in D minor, BWV 999

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=60
- File: https://www.mutopiaproject.org/ftp/BachJS/BWV999/Bach_Prelude_BWV999/Bach_Prelude_BWV999.mid (sha256 a246bc598d6e…)
- Level 6: frets capped at 12; highest fret used 10
- Octave shift 0 · 43 bars · 505 onsets · 0 notes left out
- Tempo 80 from the LilyPond \tempo
- Mutopia licence: Public Domain
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 509 note-ons match the tab in pitch and onset.
- Source spot-check: bars 1-2 (bass d4 r a'8 f under the 16th figure d' f' a' ...) and the final A chord read against the .ly.
- Signatures: 3/4 and the key as in the .ly; 43 bars.
- Form: no repeats or D.C. in the source.
- Fingering: frets 0-10 (Level 6 cap 12), 2 voice(s), at most 5 notes struck together, widest fretted span 4 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 80: 4 = 80 in the .ly; no marking.
- Level 6: 16th arpeggios with shifts to fret 10, five-note chords: L6; compared with carcassi-op60-07 and sanz-preludio (L5, easier).
- Title and composer from the .ly header and Mutopia page; licence Public Domain kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 509 tab numbers, none overlapping.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
