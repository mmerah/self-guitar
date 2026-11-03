# Review: Study No. 7, Op. 60

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=300
- File: https://www.mutopiaproject.org/ftp/CarcassiM/O60/carcassi-op60-07/carcassi-op60-07.mid (sha256 98a50008b831…)
- Level 6: frets capped at 12; highest fret used 7
- Octave shift 0 · 28 bars · 433 onsets · 0 notes left out
- Tempo 110 from the MIDI file (checked: see the notes)
- Mutopia licence: Public Domain
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 435 note-ons match the tab in pitch and onset.
- Source spot-check: bar 1 a16 a' a a c a a a f a a a e a a a, bar 2 and the last bar a2 read against the .ly.
- Signatures: 4/4 and the key as in the .ly; 28 bars.
- Form: Bars 1-8 once, then |: 9-28 :|. Marked with \section labels in the tab.
- Fingering: frets 0-7 (Level 6 cap 12), 2 voice(s), at most 2 notes struck together, widest fretted span 3 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 110: Allegro (markup), 110 = the typesetter's MIDI tempo.
- Level 6: Allegro 16th arpeggios on a repeated A, frets 0-7: L6; compared with bach-prelude-bwv999 and sanz-preludio (L5, easier).
- Title and composer from the .ly header and Mutopia page; licence Public Domain kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 435 tab numbers, none overlapping.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
