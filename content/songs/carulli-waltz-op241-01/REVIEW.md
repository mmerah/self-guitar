# Review: Waltz, Op. 241 No. 1

Auto-imported by `scripts/import` (mutopia). Not shipped: content:build ignores this file.
Reviewed in M5 part 1 (kept as the worked example of a finished review).

- Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1656
- File: https://www.mutopiaproject.org/ftp/CarulliF/guitar-skole-no-01/guitar-skole-no-01.mid (sha256 2ac7a4f7d41f…)
- Level 3: frets capped at 5; highest fret used 3
- Octave shift 0 · 24 bars · 66 onsets · 0 notes left out
- Tempo 72 from the MIDI file (check it)
- Mutopia licence: Creative Commons Attribution 4.0
- Flagged:
  - none

## Review notes

- Checked against the Mutopia LilyPond source (guitar-skole-music-01.ly): bass on beat 1, the C and G7 double stops (<c'' e''>, <b' f''>) on beats 2-3, d''-4 on fret 3 of B; all in first position, frets ≤ 3.
- The source has three repeated sections (\repeat volta 2: bars 1–8, 9–16, 17–24); MIDI drops the repeat signs.
- The MIDI holds the bass notes for the whole bar (the source writes 8ths): it sounds fine and is easier to read; the bass and melody swap stems from bar 17 (MIDI voice split).
- Tempo 72 (quarter) is the source's own "Tempo di Valse" marking.

## Checklist

- [x] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [x] Time and key signature, pickup and bar count match the source.
- [x] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [x] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [x] Tempo is the piece's own (not a MIDI default).
- [x] Title, composer (dates), opus/number and the source edition are correct.
- [x] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [x] Renders on a 360 px phone without overlapping tab numbers.
