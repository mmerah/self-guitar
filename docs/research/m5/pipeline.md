# M5 ingestion pipeline: sources → alphaTex

Goal: a source score (MusicXML, MIDI, LilyPond or ABC) goes through a script and comes out as a reviewed
`content/songs/<id>/{meta.json, score.atex}`. Every step below was tried in a scratch directory
against the repo's own `@coderline/alphatab` 1.9.0 (Node 22). Nothing in the repo was changed.

```
  Mutopia .ly + .mid ─┐
  PDMX .mxl ──────────┼─► 1 normalise to MusicXML ─► 2 alphaTab Score (Node) ─► 3 fingering (Viterbi)
  ABC (local only) ───┘                                                              │
                                                                                     ▼
      7 commit  ◄── 6 human review  ◄── 5 validate (content:check + import checks)  ◄── 4 emit alphaTex
```

Proposed layout: `tools/import/` (this is VISION §5's planned location).

```
tools/import/
  fetch-mutopia.ts      # id → .ly/.mid/info page into data/import/mutopia/<id>/ (gitignored)
  fetch-pdmx.ts         # extract named paths from a local mxl.tar.gz into data/import/pdmx/
  to-musicxml.py        # music21: .mid/.abc → .musicxml (run: python -I, in a venv)
  musicxml-to-atex.ts   # alphaTab import → fingering → compact alphaTex + meta.json draft
  fingering.ts          # the DP (pure, unit-tested)
  check-import.ts       # extra validation (range, level limits, bar count vs source)
  sources.lock.json     # every imported item: source URL, sha256 of the source file, licence
```

## 1. Converters: which one for which format

| From                  | Tool                                                                                                              | Status here                             | Notes                                                                                                                                                                                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MusicXML / MXL (PDMX) | **alphaTab itself**: `alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, settings)`                          | ✅ works in Node, no DOM needed         | Reads `.musicxml` and compressed `.mxl`. If the MusicXML has `<staff-details>`/`<frame>` tab data, string and fret come through unchanged.                                                                                                                                                              |
| MIDI (Mutopia `.mid`) | **music21** (`pip install music21`: 10.5.2 on PyPI, reachable) `converter.parse(mid).write('musicxml')`           | ✅ 4/4 tested, all 4 samples round-trip | Quantises well for these études. Loses ties, tuplet spelling, articulations and fingerings. Tempo is often a default (160). Can drop a pickup bar: compare bar count with the `.ly` header's `\time` and `\partial`.                                                                                    |
| LilyPond `.ly`        | `python-ly` 0.9.10 (`ly musicxml`)                                                                                | ⚠️ unreliable                           | Crashes on Mutopia's `copyright = \markup{…}` header and produces empty scores for variable-based sources (Sor Op. 60/1). Use `.ly` only as **reference** (fingering marks `-1`, string numbers `\2`, `\partial`, `\time`). LilyPond has no MusicXML export, and `musicxml2ly` only goes the other way. |
| ABC                   | music21 parses ABC natively; or `abc2xml.py` (Wim Vree; **not on PyPI**: a single-file download from wim.vree.nl) | not needed for M5                       | **TheSession data is local-only.** Run its import with no AI step, keep the output in the data volume, never commit it (VISION §5 policy).                                                                                                                                                              |
| Guitar Pro            | alphaTab importer                                                                                                 | ✅ (built-in)                           | Only for our own .gp files.                                                                                                                                                                                                                                                                             |

Python hygiene: install the converters in a venv outside the repo (`python -m venv .venv-import`). Run with
`python -I` and pass downloaded files as arguments, with downloads kept in their own directory.

### alphaTab 1.9 API (verified against `dist/alphaTab.d.ts` and by running it)

```js
import * as alphaTab from '@coderline/alphatab';
const settings = new alphaTab.Settings();
const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(buf), settings);
// …mutate score (fingering)…
staff.stringTuning = new alphaTab.model.Tuning('Standard', [64, 59, 55, 50, 45, 40], true); // high → low
staff.showTablature = true;
const tex = new alphaTab.exporter.AlphaTexExporter().exportToString(score, settings);
alphaTab.importer.ScoreLoader.loadAlphaTex(tex, settings); // re-parse = first validation
```

Model facts that matter:

- `Note.string`: **1 = lowest string** (low E) in the model. alphaTex's `fret.string` counts the other way: `0.6` is the low E.
- `Note.fret` is the fret number, with 0 = open string.
- Pitched (non-tab) notes use `octave` and `tone`. The pitch is `octave*12 + tone`.
- To turn a pitched note into a tab note, set `string` and `fret` and set `octave = tone = -1`.
- `Staff.stringTuning.tunings` are listed from the top tab line (high e) down.

The exporter output is correct but verbose. It writes one note per line in `fret.string.duration` form, with
`\hideDynamics`, `volume 15`, `\simile none`, `\ottava regular`, a per-note
`{dy f instrument …}` and `\artist "Music21"`. **Use a small house-style emitter**
(`musicxml-to-atex.ts`, about 150 lines) that writes our compact form:

```
\title "…"
\tempo N
\track ("Guitar" "Gtr.") { instrument acousticguitarnylon }
\staff { score tabs }
\ts (3 4)
:8 0.5 2.4 …
```

It keeps `:dur` changes only when the duration changes, `(chord)` groups, `{ch "G"}` and `\section`.
Keep `AlphaTexExporter` as the oracle. Load both outputs and assert that the sequences of
(bar, start, string, fret, duration) are equal.

## 2. Pitch normalisation

- Guitar is written an octave above sounding pitch.
- Mutopia MIDIs are inconsistent: Sor 60/1, Giuliani 50/1 and Horetzky 1 came out at _written_ pitch, Carcassi 60/1 at sounding pitch.
- Rule: if the lowest note is ≥ E3 (MIDI 52), shift −12. Then require every note to be within E2 (40) and B5 (83).
- Detect drop-D or other tunings: if the piece uses D2 (38) as its lowest note, retune string 6 to D (`\tuning (E4 B3 G3 D3 A2 D2)`). The .ly header usually says so (`scordatura`, `6=D`).
- Worrall's _Spanish Fandango_ is in open G: handle it by hand.

## 3. Auto-fingering: a DP / Viterbi string–fret assignment

Prior art:

- **tuttut** (PyPI 0.0.6, MIT, github.com/natecdr/tuttut) turns MIDI into tab with a graph and shortest path over playable chord shapes (networkx).
- The tuttut idea is worth copying. The package itself pins 2022 versions of numpy and matplotlib, so reimplementing it in TS (≈200 lines) is better than depending on it.
- Academic lineage: Sayegh 1989 (_optimum path paradigm_), Radicioni et al. 2004 and Tuohy & Potter 2005 (GA). All use the same layered-graph formulation.

**Formulation** (implemented in `fingering-prototype.mjs`, which ran on 4 pieces):

1. **Onsets.** Collect every note across all voices that starts at the same time; that is one layer. Bass and melody voices must be fingered together.
2. **Candidates per onset.** List every assignment of the onset's pitches to _distinct_ strings with `0 ≤ fret ≤ maxFret(level)`:
   - L3: 5
   - L4–5: 7
   - L6+: 12
     If none exists, retry up to fret 12 with a +50 penalty and flag the onset for review.
3. **Local cost** of a shape:
   - `maxFret × 1.0`: prefer low positions.
   - `−0.5 × open strings`: prefer open strings.
   - `+10 × (span − 3)` when the fretted span is above 3 frets (L3: above 2).
   - `+5` if a fretted note sits on a _lower_ string than an open string in the same shape (unless it's a standard open-chord shape).
   - `+3` per fretted note beyond 4 fingers.
4. **Transition cost** between consecutive shapes:
   - `2 × |Δ position|` when the hand moves more than 1 fret. The position is the lowest fretted fret, and open strings are free.
   - `+1` for each string change on legato, slurred notes.
   - `+4` for the same finger on different frets back to back (a later refinement once finger assignment exists).
5. **Viterbi.** Forward pass with back-pointers, minimum total cost, then backtrack. It is O(N·K²); K is ≤ 30 for 1–3 notes, so whole études take milliseconds.
6. **Optional second pass: finger assignment** (p-i-m-a for the right hand, 1–4 for the left) with the same DP over (string, finger), writing `{lf n}` / `{rf n}` note effects. Tested in 1.9: both take a number, and `rf 1/2/3/4` maps to p/i/m/a. `lf 1` parses to the model's `Fingers.Thumb` (0), so `lf` is offset by one: left-hand index = `lf 2`. Unit-test the mapping. Other verified syntax: `{bd}`/`{bu}` brush strums, `{sd}`/`{su}` pick strokes, note-level `{pm}` palm mute, `{h}` hammer/pull origin, `x.6` dead note, `{d}` dotted (`:4.` does **not** parse). Prefer `p` on strings 4–6 and i/m/a on strings 3/2/1.
7. **Honour source fingering.** If the `.ly` or MusicXML says string 2, fix that string and only let the DP choose among the remaining candidates.

Prototype results (max fret 5):

| Piece             | Onsets | Shift | Onsets > fret 5 |
| ----------------- | -----: | ----: | --------------: |
| Sor Op. 60/1      |     59 |   −12 |               0 |
| Giuliani Op. 50/1 |    123 |   −12 |               0 |
| Horetzky No. 1    |    104 |   −12 |               6 |
| Carcassi Op. 60/1 |    324 |     0 |               9 |

Carcassi 60/1 is a scale étude that does go higher, so it belongs at L5+.

## 4. Chord-sheet songs (no source score)

Strummed songs are authored in ChordPro (see `chordpro-design.md`). The accompaniment `score.atex` is
_generated_ from the chords, the `::strum` pattern and the bar structure, with voicings from `content/chords.ts`.
A melody track, if any, is typed by hand or imported as above.

## 5. Validation

Automatic checks. CI fails on any of these.

1. **`npm run content:check`**. It already:
   - re-parses with alphaTab and reports diagnostics with codes;
   - checks that every non-empty voice fills its bar exactly (`playbackDuration` sum = `masterBar.calculateDuration()`; a pickup bar may be shorter);
   - validates `meta.json` against `songMetaSchema`.
2. **New `check-import.ts`** (or extra rules inside `content:check` for items with `importedFrom`):
   - **Range:** every note is within E2 and B5 and fret ≤ 12. **No fret > 12 below level 5.** Max fret by level: L3 ≤ 5, L4 ≤ 7, L5 ≤ 9 (L5+ may exceed 12 only with a flag).
   - **Stretch:** the fretted span inside one beat is ≤ 4 (≤ 3 below L4).
   - **Simultaneity:** at most 6 notes per beat, distinct strings, no two notes on the same string at once across voices.
   - **Bar count** equals the source (Mutopia `.ly` `\skip`/bar count, or the PDMX `song_length.bars`), so a dropped pickup is caught.
   - **Duration:** the playing time at `\tempo` is under 4 minutes for L3–5, and `\tempo` is not the music21 default 160 unless confirmed.
   - **Licence:**
     - `license` must be one of {Public Domain, CC0, CC BY x, CC BY-SA x} and match `sources.lock.json`.
     - A CC BY-SA source cannot be labelled CC0.
     - The composer's death year must be ≤ current year − 71 (needs `composerDied` in meta).
     - The source must not be TheSession or ClassTab (path/URL denylist).
   - **Round-trip:** the house-style emitter output and `AlphaTexExporter` output produce identical note sequences.
   - **Determinism:** re-running the importer on the locked source reproduces the committed `score.atex` byte for byte, or the reviewer edits it and adds `"edited": true`.

**Human review checklist** (one PR per batch of ≤ 5 pieces; reviewer ticks in the PR body):

- [ ] Plays back correctly against the source PDF or IMSLP scan (listen at 60 % tempo): pitches, rhythm, ties, repeats.
- [ ] Pickup bar, time signature and key signature match the source; repeats are expanded or marked.
- [ ] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch or barre left unmarked.
- [ ] The level is right: chords and positions used, max fret, tempo. Compare with 2 existing pieces of that level.
- [ ] Title, composer (with dates), opus and number are correct; the source edition is named.
- [ ] Licence and attribution are correct: the Mutopia typesetter is named, and the CC BY-SA "share-alike" is kept.
- [ ] `meta.json` `key`, `style` and `level` are filled in. `score.atex` has a 1–2 line header comment with the form and the key move.
- [ ] Renders on a 360-px phone without overlapping tab numbers (check the preview).

## 6. Storage: one folder per item

```
content/songs/sor-op60-01/
  meta.json
  score.atex
```

`meta.json` (proposed fields; ⚠️ `songMetaSchema` is a `z.strictObject`, so these keys must be **added to
`src/lib/content/schema.ts`** before an imported song passes `content:check`):

```json
{
	"id": "sor-op60-01",
	"title": "Lesson in C (Op. 60 No. 1)",
	"composer": "Fernando Sor",
	"composerDied": 1839,
	"arranger": "Mutopia: typeset by <maintainer>; tab by Self-Guitar importer",
	"level": 3,
	"style": "classical",
	"key": "C major",
	"source": "25 Leçons progressives, Op. 60 No. 1 (1837)",
	"importedFrom": "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=666",
	"sourceFile": "https://www.mutopiaproject.org/ftp/SorF/O60/sor_op60-01/sor_op60-01.mid",
	"sourceSha256": "…",
	"license": "CC BY-SA 2.5 (Mutopia typesetting); tab edit CC BY-SA 2.5",
	"attribution": "Sor - Op. 60 No. 1. Typeset by <maintainer> for the Mutopia Project (CC BY-SA 2.5). Tablature by Self-Guitar contributors."
}
```

- `STYLES` is currently `folk | classical | blues | strumming`. The song CSV uses
  `shanty / spiritual / carol / children / country / ballad`, so either extend the enum or keep those as a
  separate `tags` array and map: shanty, carol, children and ballad → folk; spiritual and country → strumming.
- Raw downloads (`.ly`, `.mid`, `.mxl`, PDMX tarballs) live in the data volume (`data/import/`, gitignored).
  Only the reviewed `meta.json` and `score.atex` are committed.
- The Attributions page lists `attribution` + `importedFrom` for every item (VISION §5).

## 7. Order of work

1. `fingering.ts` + unit tests (fixtures: the 4 converted pieces).
2. `musicxml-to-atex.ts` with the house-style emitter + exporter oracle.
3. Schema fields (`importedFrom`, `sourceFile`, `sourceSha256`, `composerDied`, optional `tags`) + `check-import`.
4. Mutopia batch: Tier A, 48 pieces, MIDI path.
5. PDMX: download `mxl.tar.gz` (1.9 GB) once into the data volume, extract the 12 picks, MusicXML path.
6. Human review in PRs of 5.
