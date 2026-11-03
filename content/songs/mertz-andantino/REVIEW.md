# Review: Andantino (Guitar-Skole No. 5)

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1659
- File: https://www.mutopiaproject.org/ftp/MertzJK/guitar-skole-no-05/guitar-skole-no-05.mid (sha256 23acc87812d3…)
- Level 4: frets capped at 7; highest fret used 6
- Octave shift 0 · 16 bars · 88 onsets · 0 notes left out
- Tempo 120 from the MIDI file (checked: see the notes)
- Mutopia licence: Creative Commons Attribution 3.0
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): 138 of 139 note-ons match the tab in pitch and onset; the missing one is explained below.
- Source spot-check: bar 1 a''4 g''8 f'' e'' d'' c'' b', bars 11-12 (both voices) and the last bar read against the .ly.
- Signatures: 4/4 and the key as in the .ly; 16 bars.
- Form: no repeats or D.C. in the source.
- Fingering: frets 0-6 (Level 4 cap 7), 2 voice(s), at most 4 notes struck together, widest fretted span 3 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 120: Andantino 4=120 in the .ly (the edition's value).
- Level 4: four-note chords, frets 0-6: L4; compared with giuliani-op51-03 and coste-menuett.
- Title and composer from the .ly header and Mutopia page; licence CC BY 3.0 kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 138 tab numbers, none overlapping.
- Hand edit: Bars 11-12 rewritten by hand as the source's two lines (the MIDI gave a third voice). Bar 12: the .ly melody has g' against the doubling stem voice's gis' over the E7 bass; the g' is taken as a typo and left out (only G-sharp sounds).

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
