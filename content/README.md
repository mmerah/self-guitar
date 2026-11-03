# Content authoring

Everything here is compiled by `npm run content:build` into `generated/content.json`.
Run `npm run content:check` after every edit: it fails on any mistake listed below.

| Path                       | What                                                        |
| -------------------------- | ----------------------------------------------------------- |
| `curriculum.ts`            | Levels → units → skills (ids are stable: never rename one)  |
| `lessons/L<level>/<id>.md` | One lesson: YAML front-matter + Markdown body               |
| `exercises/<id>/meta.json` | Tempo-ladder exercise + `score.atex` (alphaTex, std tuning) |
| `warmups/<id>/meta.json`   | Warm-up routine (2–5 min of steps), see below               |
| `songs/<id>/`, `chords.ts` | Songs (tab and/or chord sheet), see below; chord voicings   |

## Lesson front-matter

```yaml
id: first-strum # = the file name, kebab-case
title: Your first strum on Em
level: 0 # = the L<n> folder
unit: first-sounds # a unit of that level in curriculum.ts
order: 3 # position in the unit (default 0; ties sort by id)
skills: [first-strum] # skill ids from curriculum.ts (at least one)
prereqs: [pick-or-fingers] # lessons EARLIER in curriculum order (no cycles)
minutes: 10
mastery: { type: exercise, id: em-down-strums, bpm: 70 } # optional
```

`mastery` is one of (checked on the server from stored data):

- `{ type: exercise, id, bpm }`: `cleanReps` clean ladder passes in a row at ≥ `bpm` (within the exercise's ladder).
- `{ type: changes, a: C, b: G, target: 30 }`: 1-minute-changes best for the pair ≥ `target`.
- `{ type: self, items: [...] }`: 1–8 statements; the user ticks them all.
- `{ type: tuner }`: the user confirms after tuning with the tuner.

A skill is _mastered_ when every lesson teaching it has its check satisfied (a lesson without
`mastery` counts once completed). Every skill of Level 0 must be taught (error); Levels 1–3 warn.

## Body

Start with a 1–2 sentence goal, then `## How to practise this` (a 5–10 minute plan; in Levels 1–3
its last item is `Review:` naming 1–2 earlier items). Explanations follow. Keep paragraphs phone-sized (2–3 sentences). Supported
Markdown: `##`/`###` headings (no `#`), paragraphs, `-` and `1.` lists, `**bold**`, `_italic_`,
`` `code` ``, `[text](/in-app/path)` or `https://` links. Raw HTML is rejected, and so are nested
or indented lists, directives inside lists, `>` quotes, `---` rules, `~~~`/4-backtick fences and tables.

One directive per line (`::name[label]{attrs}`; attrs are `key="value"` or `key=value`):

| Directive                                               | Renders                                  |
| ------------------------------------------------------- | ---------------------------------------- |
| `::chord{id="g" voicing="3-2-0-0-0-3"}`                 | Diagram + play button (voicing optional) |
| `::chords{ids="g,c,d"}`                                 | 2–6 diagrams in a grid                   |
| `::exercise{id="first-notes-e-b"}`                      | Practice card → tempo ladder             |
| `::strum{pattern="D - D U - U D U" bpm=70 chord="e-m"}` | Strum widget with click (chord optional) |
| `::tool{name="tuner" tuning="drop-d"}`                  | Link card to a pre-configured tool       |
| `::tool{name="metronome" bpm=70 ts="3/4" sub=2}`        | (`ts` 2/4 3/4 4/4 6/8, `sub` 1–4)        |
| `::tool[Daily changes]{name="changes" a="C" b="G"}`     | `[label]` overrides the card title       |
| `::tip[One line]` / `::warning[One line]`               | Callout                                  |

Chord ids are slugs (`e-m`, `f-sharp-m7`) or names (`Em`); voicing ids are the frets low→high
(`x-3-2-0-1-0`), see `/tools/chords`. Strum slots are 8th notes: `D` down, `U` up, `-` miss;
4, 6, 8, 12 or 16 slots (2/4, 3/4, 4/4, two bars). Multi-paragraph callouts:

    :::tip
    Text, lists…
    :::

An inline tab (compact player with playback) is a fenced block; it must parse with alphaTab:

    ```atex
    \tempo 60
    :4 0.1 1.1 3.1 r
    ```

## Exercises

`meta.json`: `{ "id", "title", "skills": [...], "howTo": [...], "chords"?, "strum"?, "startBpm", "targetBpm", "step": 4, "cleanReps": 3 }`
(`step`/`cleanReps` optional; `startBpm` ≈ 65% of `targetBpm`).

- `howTo` (required): 1–3 imperative steps (≤ 140 chars each, ~30 words in all), shown as "What to play"
  above the tab. Say the strings, frets and fretting fingers (1 index … 4 pinky), pick or p-i-m-a,
  strum direction and count, and the key move. **It must match `score.atex` exactly** (chords, bars,
  rhythm): change both together, and don't repeat it in the lesson text around the `::exercise` card.
- `chords`: chord ids or names from `chords.ts`, in order of first appearance; for every exercise that plays chords.
- `strum`: the pattern in `::strum` syntax (8th-note slots, e.g. `"D - D - D - D -"` for 4 downs); required
  when the exercise is strummed.

`score.atex` needs a `\tempo` (the ladder scales playback from it)
and bars that add up. Keep loops short (2–4 bars); a form or song (a 12-bar blues, an 8-bar song, a one-pass warm-up drill) may run full length. The ladder: `cleanReps` clean passes in a row → +`step` BPM up to `targetBpm`; a miss resets the streak, two misses in a row → −`step` (never below `startBpm`); `cleanReps` in a row at `targetBpm` masters it. Write original material only.

## Songs

`meta.json` (strict): `id` (= folder), `title`, `composer`, `arranger`, `level` 0–9, `style` (folk shanty
spiritual blues carol children country ballad classical strumming fingerstyle), `key` ("G major"),
`source`, `sourceUrl`? (https), `license`, `attribution`, `play` (melody | chords | fingerstyle),
`import`? (`{ via, file, sha256, composerDied? }`, imports only). Beside it: `score.atex` (a tab),
`song.cho` (a chord sheet, `play: "chords"`) or both (sheet first, "Tab" one tap away); the kind is
derived. `REVIEW.md` (imports) is never compiled or shipped. **`song.cho`** is a ChordPro subset:

```
{title: Oh My Darling, Clementine}   = meta.title         {key: G}   chord-shape key; root = meta.key
{tempo: 112}  quarter-note BPM 30–250  {time: 3/4}  2/4 3/4 4/4 6/8  {capo: 2}  0–7 (optional)
{x_level: 1} = meta.level (optional)  {composer: …} {lyricist: …} {artist: …}  credits
{x_strum: D - D - D -}  8th-note slots as ::strum (D U -), one bar (4/6/8) or two (×2)
{start_of_grid label="Verse"}  one grid line per lyric line, one | bar | per bar, cells = beats
| G . . | G . . | D . . | D . . |   (a chord name starts a cell, "." continues it)
{end_of_grid}
{start_of_verse label="Verse 1"} … {end_of_verse}   also chorus and bridge (sov/soc/sob short forms)
In a [G]cavern, in a canyon,        [Chord] sits before its syllable (lines ≤ 48 characters)
{chorus} repeats the last chorus · {comment: …} · {x_end: G} final bar · {x_voicing: G=320033}
```

A block plays the grid inside it, else the one labelled like it ("Verse 2", else "Verse"), with its
own `x_strum` or the file's. Each lyric line's chords must equal its grid line's (a chord carried over
from the line before may be left out); chords resolve in `chords.ts` (aliases `Amin` `Gmaj` `FM7`
`Csus`; slash chords play their base). Unknown directives are errors. `content:build` generates the
accompaniment (D = all voiced strings, U = top three, - rings on) for playback, line highlight and
transpose.

## Warm-ups: `warmups/<id>/meta.json`

`id`, `title`, `goal` (stretch independence chromatic changes strumming fingerpicking legato muting
pentatonic), `level` 0–9 (planned only up to the learner's level), `minutes` 2–5, `howTo` (1–3 steps,
≤ 30 words), `startBpm`/`targetBpm` (both or neither; tab steps need them), `tags`, and `steps` (1–8,
in order; each may add `text` ≤ 120 chars and `seconds` 10–300, default an even share):

- `{ "timer": 30, "text": "Spread the fingers…" }`: a timed stretch (5–300 s), moves on by itself;
- `{ "exercise": "chromatic-warm-up" }`: that exercise's tempo ladder (its skills count as reviewed);
- `{ "atex": "\\tempo 80\n…", "chords": ["G 3-2-0-0-3-3"], "strum": "D - D - D - D -" }`: an inline tab
  (needs `\tempo`; plays from `startBpm`), chord diagrams (a name or "name voicing-id"), the strum row;
- `{ "strum": "D - D U", "bpm": 60, "chord": "G" }`: the strum widget with its click.

## Imported tabs (`scripts/import/`)

Downloads go to `IMPORT_DIR` (default `data/import/`, gitignored): data only, never run. MIDI needs
music21 (`python3 -m venv V && V/bin/pip install music21`; `IMPORT_PYTHON=V/bin/python`, run with `-I`).

```
node --experimental-strip-types scripts/import/mutopia.mjs 666 --slug sor-op60-01 --level 3 [--title --tempo --key --shift --force]
node --experimental-strip-types scripts/import/pdmx.mjs (--file x.mxl | --url U | --tar mxl.tar.gz
  --member ./mxl/…mxl) --slug … --level … [--title --composer --license "CC0 1.0"] (CSV fills these)
node --experimental-strip-types scripts/import/fingering.mjs <song-id> --level 4 [--write]
```

Pipeline: `.mid` (LilyPond-only pieces are skipped) → MusicXML → alphaTab → Viterbi fingering
(`src/lib/import/fingering.ts`: frets ≤ 5 to L3, ≤ 7 at L4, ≤ 12 from L5; open strings, low positions;
held notes keep their string) → compact alphaTex (checked against alphaTab's exporter) → `meta.json`
(arranger "Self-Guitar (auto-fingered)"; the source licence kept: CC BY-SA stays CC BY-SA),
`score.atex`, `REVIEW.md`: play it against the source PDF, fix tempo/title/level, tick every box.
content:check fails an import above its level's fret cap, with > 4 notes at once below L5, a note
without a string, or no licence/source. Three-voice MIDI separates poorly: prefer MusicXML (PDMX).
