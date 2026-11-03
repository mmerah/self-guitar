# Review: Gavotte, 17th century (Guitar-Skole No. 24)

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1678
- File: https://www.mutopiaproject.org/ftp/CosteN/guitar-skole-no-24/guitar-skole-no-24.mid (sha256 eac202b0de73…)
- Level 4: frets capped at 7; highest fret used 6
- Octave shift 0 · 13 bars · 59 onsets · 0 notes left out
- Tempo 105 from the MIDI file (checked: see the notes)
- Mutopia licence: Creative Commons Attribution 3.0
- Pickup of 2 (--pickup): bar 1 is rests then the pickup
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 104 note-ons match the tab in pitch and onset.
- Source spot-check: bar 1 (half-bar pickup d''4 e''), bar 2 f''4 f''8 g'' e''4 d''8 e'', bar 10 and the last bar read against the .ly.
- Signatures: 2/2 and the key as in the .ly; 13 bars including the pickup bar (rests, then the pickup).
- Form: |: A (pickup, bars 2-5) :| |: B (6-13) :|. Marked with \section labels in the tab.
- Fingering: frets 0-6 (Level 4 cap 7), 2 voice(s), at most 3 notes struck together, widest fretted span 3 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 105: Gavotte 4=105 in the .ly (half about 52).
- Level 4: D minor up to fret 6: L4; compared with giuliani-op51-03 and coste-menuett.
- Title and composer from the .ly header and Mutopia page; licence CC BY 3.0 kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 104 tab numbers, none overlapping.
- Hand edit: Bar 10: the bass B-flat A G is written as the source's quarter, quarter, half (the MIDI merge had made the B-flat a half and pushed the A into a third voice).

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
