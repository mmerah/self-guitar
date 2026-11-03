# Review: Allegretto (Guitar-Skole No. 19)

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1673
- File: https://www.mutopiaproject.org/ftp/CarcassiM/guitar-skole-no-19/guitar-skole-no-19.mid (sha256 4eab35cd42fb…)
- Level 4: frets capped at 7; highest fret used 7
- Octave shift 0 · 37 bars · 198 onsets · 0 notes left out
- Tempo 92 from --tempo
- Mutopia licence: Creative Commons Attribution 3.0
- Pickup of 4 (--pickup): bar 1 is rests then the pickup
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): 240 of 241 note-ons match the tab in pitch and onset; the missing one is explained below.
- Source spot-check: bar 1 (pickup b'8 gis''), bar 2 <gis' e''>4 b'8 gis'', bars 16-19 (both voices) and the final <gis' e''>2 read against the .ly.
- Signatures: 2/4 and the key as in the .ly; 37 bars including the pickup bar (rests, then the pickup).
- Form: |: A (pickup, bars 2-9) :| then B to the end, once. Marked with \section labels in the tab.
- Fingering: frets 0-7 (Level 4 cap 7), 2 voice(s), at most 3 notes struck together, widest fretted span 2 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 92: Allegretto; no number in the .ly (MIDI 60): set to 92.
- Level 4: E major 16th arpeggios up to fret 7: L4; compared with giuliani-op51-03 and coste-menuett.
- Title and composer from the .ly header and Mutopia page; licence CC BY 3.0 kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 240 tab numbers, none overlapping.
- Hand edit: Bar 18 (source bar 16): the stem voice's dis'2 contradicts the melody's d'! (natural sign written) over G harmony; taken as a typo, the bass is D natural on the open D string.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
