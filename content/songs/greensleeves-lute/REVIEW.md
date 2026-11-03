# Review: Greensleeves (lute setting)

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=109
- File: https://www.mutopiaproject.org/ftp/Traditional/Greensleaves/Greensleaves.mid (sha256 468c9878cff4…)
- Level 4: frets capped at 7; highest fret used 4
- Octave shift -12 · 33 bars · 72 onsets · 0 notes left out
- Tempo 100 from --tempo
- Mutopia licence: Public Domain
- Pickup of 4 (--pickup): bar 1 is rests then the pickup
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 110 note-ons match the tab in pitch and onset.
- Source spot-check: bar 1 (pickup a4), bar 2 c2 d4 and the final a2. read against the .ly.
- Signatures: 3/4 and the key as in the .ly; 33 bars including the pickup bar (rests, then the pickup).
- Form: no repeats or D.C. in the source.
- Fingering: frets 0-4 (Level 4 cap 7), 2 voice(s), at most 3 notes struck together, widest fretted span 2 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 100: no marking; the .ly's MIDI 160 is a default: set to 100.
- Level 4: frets 0-4 but lute-style three-part texture: L4; compared with giuliani-op51-03 and coste-menuett.
- Title and composer from the .ly header and Mutopia page; licence Public Domain kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 110 tab numbers, none overlapping.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
