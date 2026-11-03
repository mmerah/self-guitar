# Review: Allegro, Op. 50 No. 6

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1334
- File: https://www.mutopiaproject.org/ftp/GiulianiM/O50/giuliani-op50n06/giuliani-op50n06.mid (sha256 41d341da3865…)
- Level 4: frets capped at 7; highest fret used 5
- Octave shift -12 · 32 bars · 189 onsets · 0 notes left out
- Tempo 144 from the MIDI file (checked: see the notes)
- Mutopia licence: Creative Commons Attribution 3.0
- Pickup of 4 (--pickup): bar 1 is rests then the pickup
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 250 note-ons match the tab in pitch and onset.
- Source spot-check: bar 1 (pickup e8 e with the acciaccatura f), bar 2 and the final chord read against the .ly.
- Signatures: 6/8 and the key as in the .ly; 32 bars including the pickup bar (rests, then the pickup).
- Form: no repeats or D.C. in the source.
- Fingering: frets 0-5 (Level 4 cap 7), 2 voice(s), at most 4 notes struck together, widest fretted span 2 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 144: Allegro (header 'meter'); 144 = the typesetter's MIDI tempo (6/8).
- Level 4: frets 0-5 but the closing A-minor chord is a 3-string partial barre at fret 5 and the tempo is Allegro: L4; compared with giuliani-op51-03 and coste-menuett.
- Title and composer from the .ly header and Mutopia page; licence CC BY 3.0 kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 250 tab numbers, none overlapping.
- Known issue: The acciaccaturas arrive from the MIDI as 32nd notes taken from the main note (LilyPond plays them that way); read them as grace notes.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
