# Review: Study No. 1, Op. 60

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 2 (tab importer); kept as the record of what was checked.

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=13
- File: https://www.mutopiaproject.org/ftp/CarcassiM/O60/carcassi-op60-01/carcassi-op60-01.mid (sha256 aa3adb9ed150…)
- Level 5: frets capped at 12; highest fret used 8
- Octave shift 0 · 43 bars · 324 onsets · 0 notes left out
- Tempo 120 from --tempo
- Mutopia licence: Public Domain
- Flagged:
  - none

## Review notes

- Notes: compared with the Mutopia MIDI's raw note-on events (LilyPond's rendering of the same .ly as the PDF; ties are one event): all 339 note-ons match the tab in pitch and onset.
- Source spot-check: bar 1 c,8 c' b a g f e d, bar 2 c e' d c b a g f, bars 9-10 (the run to C6 at 8.1 and back) and the final <c g e> over C read against the .ly.
- Signatures: 4/4 and the key as in the .ly; 43 bars.
- Form: no repeats or D.C. in the source.
- Fingering: frets 0-8 (Level 5 cap 12), 2 voice(s), at most 4 notes struck together, widest fretted span 3 frets; open strings and basses on strings 4-6 as the DP chose, no note on a string already ringing.
- Tempo 120: no marking in the .ly (its typesetter says its 160 is wrong): 120.
- Level 5: scale study reaching fret 8 (above the L4 cap of 7): L5; compared with sanz-preludio and bach-prelude-bwv999 (L6, harder).
- Title and composer from the .ly header and Mutopia page; licence Public Domain kept, typesetter named in source and attribution.
- Rendered headless with alphaTab at 360 px: 339 tab numbers, none overlapping.
- Hand edit: Re-reviewed in M5 part 2: re-imported with the fixed converter (empty second-voice bars no longer carry filler rests) and, in the 14 bars where voice 2 held only the melody's second 8th under the opening C, merged into one line: the bass c4 is the same pitch as the melody's first 8th, so the bar is one scale. Bars 21-36 keep two voices (held basses under 8th arpeggios).

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
