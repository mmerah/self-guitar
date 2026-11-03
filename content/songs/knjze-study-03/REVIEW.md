# Review: Progressive Study No. 3

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1060
- File: https://www.mutopiaproject.org/ftp/KnjzeF/SixStudiesC/SixStudiesC.mid (sha256 6fb5357c8c01…)
- Level 3: frets capped at 5; highest fret used 4
- Octave shift -12 · 93 bars · 720 onsets · 0 notes left out
- Tempo 72 from the LilyPond \tempo
- Mutopia licence: Public Domain
- Pickup of 8 (--pickup): bar 1 is rests then the pickup
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 804 note-ons match the tab in pitch and onset.
- Source spot-check: bar 1 (pickup g8), bar 2 c c b c over the bass and the last bar read against the .ly.
- Signatures: 2/4 and the key as in the .ly; 93 bars including the pickup bar (rests, then the pickup).
- Form: Sections with repeats |: :|, Fine and D.C.: see the source PDF; MIDI plays each once. Marked with \section labels in the tab.
- Fingering: frets 0-4 (Level 3 cap 5), 2 voice(s), at most 2 notes struck together, widest fretted span 2 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 72: Andante: 72.
- Level 3: first position, frets 0-4, at most two notes at once: L3 (the candidate list said L4; nothing here needs it); compared with sor-op60-01 and carulli-waltz-op241-01.
- Title and composer from the .ly header and Mutopia page; licence Public Domain kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 804 tab numbers, none overlapping.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
