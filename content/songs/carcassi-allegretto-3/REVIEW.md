# Review: Allegretto (Guitar-Skole No. 22)

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1676
- File: https://www.mutopiaproject.org/ftp/CarcassiM/guitar-skole-no-22/guitar-skole-no-22.mid (sha256 65598ea60c65…)
- Level 4: frets capped at 7; highest fret used 5
- Octave shift 0 · 25 bars · 130 onsets · 0 notes left out
- Tempo 84 from --tempo
- Mutopia licence: Creative Commons Attribution 3.0
- Pickup of 8 (--pickup): bar 1 is rests then the pickup
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 168 note-ons match the tab in pitch and onset.
- Source spot-check: bar 1 (pickup b'16 c''), bar 2 a'16 c'' f'' c'' b' c'' and the end of section C read against the .ly.
- Signatures: 3/8 and the key as in the .ly; 25 bars including the pickup bar (rests, then the pickup).
- Form: |: A :| |: B :| Fine |: C :| D.C. al Fine (8 bars each, pickup). Marked with \section labels in the tab.
- Fingering: frets 0-5 (Level 4 cap 7), 2 voice(s), at most 4 notes struck together, widest fretted span 2 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 84: Allegretto; no number in the .ly (MIDI 60): set to 84.
- Level 4: F major (partial barre at fret 1), frets 0-5: L4; compared with giuliani-op51-03 and coste-menuett.
- Title and composer from the .ly header and Mutopia page; licence CC BY 3.0 kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 168 tab numbers, none overlapping.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
