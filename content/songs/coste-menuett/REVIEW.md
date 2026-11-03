# Review: Menuett, 17th century (Guitar-Skole No. 10)

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1664
- File: https://www.mutopiaproject.org/ftp/CosteN/guitar-skole-no-10/guitar-skole-no-10.mid (sha256 512b9094caba…)
- Level 4: frets capped at 7; highest fret used 7
- Octave shift 0 · 16 bars · 45 onsets · 0 notes left out
- Tempo 130 from the MIDI file (checked: see the notes)
- Mutopia licence: Creative Commons Attribution 3.0
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 78 note-ons match the tab in pitch and onset.
- Source spot-check: bar 1 e'4 dis' e', bar 2 fis'4 b g' and the final E-minor chord read against the .ly.
- Signatures: 3/4 and the key as in the .ly; 16 bars.
- Form: |: A (1-8) :| |: B (9-16) :|. Marked with \section labels in the tab.
- Fingering: frets 0-7 (Level 4 cap 7), 2 voice(s), at most 4 notes struck together, widest fretted span 3 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 130: Menuett 4=130 in the .ly.
- Level 4: reaches fret 7 (cap 7), four-note chords: L4; compared with giuliani-op51-03 and sor-allegretto-op44-02.
- Title and composer from the .ly header and Mutopia page; licence CC BY 3.0 kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 78 tab numbers, none overlapping.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
