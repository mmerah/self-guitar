# Content authoring

Everything here is compiled by `npm run content:build` into `generated/content.json`.
Run `npm run content:check` after every edit: it fails on any mistake listed below.

| Path                       | What                                                       |
| -------------------------- | ---------------------------------------------------------- |
| `curriculum.ts`            | Levels → units → skills (ids are stable: never rename one) |
| `lessons/L<level>/<id>.md` | One lesson: YAML front-matter + Markdown body              |
| `exercises/<id>/meta.json` | Tempo-ladder exercise + `score.atex` (alphaTex, see below) |
| `warmups/<id>/meta.json`   | Warm-up routine (2–5 min of steps), see below              |
| `songs/<id>/`, `chords.ts` | Songs (tab and/or chord sheet), see below; chord voicings  |

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
- `{ type: ear, kind: intervals, set: [P4, P5, P8], accuracy: 80, min: 20 }`: the last `min` ear
  answers on the set (any direction) are ≥ `accuracy` % right, every item heard (defaults 80 / 20).
- `{ type: fretboard, quiz: string-6, target: 30 }`: a quiz round in ≤ `target` s, ≤ 1 miss per 10.

A skill is _mastered_ when every lesson teaching it has its check satisfied (a lesson without
`mastery` counts once completed). Every skill of Level 0 must be taught (error); Levels 1–9 warn.

## Body

Start with a 1–2 sentence goal, then `## How to practise this` (a 5–10 minute plan; in Levels 1–3
its last item is `Review:` naming 1–2 earlier items). Explanations follow. Keep paragraphs phone-sized (2–3 sentences). Supported
Markdown: `##`/`###` headings (no `#`), paragraphs, `-` and `1.` lists, `**bold**`, `_italic_`,
`` `code` ``, `[text](/in-app/path)` or `https://` links. Raw HTML is rejected, and so are nested
or indented lists, directives inside lists, `>` quotes, `---` rules, `~~~`/4-backtick fences and tables.

One directive per line (`::name[label]{attrs}`; attrs are `key="value"` or `key=value`):

| Directive                                                         | Renders                                    |
| ----------------------------------------------------------------- | ------------------------------------------ |
| `::chord{id="g" voicing="3-2-0-0-0-3"}`                           | Diagram + play button (voicing optional)   |
| `::chord{id="F@1-3-3-2-1-1"}`                                     | The same, the voicing after `@`            |
| `::chords{ids="g,c,d,F@1-3-3-2-1-1"}`                             | 2–6 diagrams in a grid                     |
| `::exercise{id="first-notes-e-b"}`                                | Practice card → tempo ladder               |
| `::strum{pattern="D - D U - U D U" bpm=70 chord="e-m"}`           | Strum widget with click (chord optional)   |
| `::strum{pattern="D-DU DUDU D-DU DUDU" bpm=60}`                   | 16th notes: "1 e & a" (see below)          |
| `::tool{name="tuner" tuning="drop-d"}`                            | Link card to a pre-configured tool         |
| `::tool{name="metronome" bpm=70 ts="3/4" sub=2}`                  | (`ts` 2/4 3/4 4/4 6/8, `sub` 1–4)          |
| `::tool[Daily changes]{name="changes" a="C" b="G"}`               | `[label]` overrides the card title         |
| `::tool{name="changes" a="C" b="F@1-3-3-2-1-1"}`                  | Opens the changes tool on that voicing     |
| `::tool{name="ear" kind="chords" set="major,minor"}`              | Also `name="fretboard"` + ::fretboard keys |
| `::fretboard[Caption]{scale="minor-pentatonic" root="A" box="1"}` | Fretboard overlay (see below)              |
| `::fretboard{quiz="string-6" target=30}`                          | Timed "find the note" quiz (stored)        |
| `::ear{kind="intervals" set="P4,P5,P8" dir="asc" n=10}`           | Mini ear quiz; answers count for `ear`     |
| `::song[Label]{id="drunken-sailor" tempo=80}`                     | Link card to a song at a tempo %           |
| `::tip[One line]` / `::warning[One line]`                         | Callout                                    |

**::fretboard**: exactly one of `scale=` (major natural-minor major-pentatonic minor-pentatonic blues
ionian dorian phrygian lydian mixolydian aeolian locrian), `chord=` (an arpeggio: major minor dim aug
sus2 sus4 7 maj7 m7 m7b5 dim7 add9 6 9), `caged=` (C A G E D or all; major shapes), `triads=` (major
minor dim aug sus2 sus4, with `strings="1-3"`/`2-4`/`3-5`/`4-6`), `note="C"` (every C) or
`notes="naturals"|"all"`; `root=` for the first four. Options: `box=` (scales: pentatonic/blues boxes
1–5, box n starting on scale note n on string 6; 7-note scales: 3-per-string positions 1–7),
`strings="6"|"6,5"|"1-3"`, `frets="5-8"`, `labels=` intervals (default; R ♭3 5…), notes, fingers
(boxes, shapes, triads and ≤ 4-fret windows have fingers), none. `highlight="#4,b2"` picks out
degrees of the scale/chord/shape in their own colour with a ring (e.g. Lydian's `#4`).
`modes="all"` (instead of `scale=`; `root=` required, `scale=` may name the mode shown first, no
`box=`) shows one neck with Ionian…Locrian chips; each mode's colour note (Dorian `6`, Lydian `#4`,
Mixolydian `b7`, Phrygian `b2`, Aeolian `b6`, Locrian `b5`) is highlighted automatically. Quizzes: `string-1`…`string-6`,
`strings-6-5`, `all`, `note-C`. **::ear** kinds and items: `intervals` (m2 M2 m3 M3 P4 TT P5 m6 M6 m7
M7 P8; `dir` asc desc harm mixed), `chords` (major minor 7 maj7 m7 sus4 sus2 dim), `progressions`
(I V IV vi ii iii; `key` C G D A E F random), `playback` (notes, needs a mic). Choices start at 2.

Chord ids are slugs (`e-m`, `f-sharp-m7`) or names (`Em`, `Bm7b5`, `C6/9`); voicing ids are the
frets low→high (`x-3-2-0-1-0`), see `/tools/chords`. **Pick a voicing** anywhere a chord is named
(exercise `chords`, `::chord`, `::chords`, `::strum chord=`, `::tool changes`, warm-ups) with
`Name@voicing-id`: `F@1-3-3-2-1-1` is the full barre F (plain `F` is the first voicing, mini F).
Qualities: `m 7 m7 maj7 m7b5 dim dim7 sus2 sus4 add9 6 9 6/9 m9 maj9 11 m11 13`, also spelled
`min`, `-`, `M7`/`Δ`, `ø`/`m7-5`, `°`/`°7`/`o7`, `69`, `sus`.

Strum slots are 8th notes by default: `D` down, `U` up, `-` miss; 4, 6, 8, 12 or 16 slots (2/4,
3/4, 4/4, two bars). **16th notes** (counted "1 e & a"): write one beat per token, four slots each
(`D-DU DUDU D-DU DUDU` is one bar of 4/4; 8, 12, 16, 24 or 32 slots), or add `sub=16` to a
`::strum` written one slot per token. **6/8**: add `ts="6/8"` to a `::strum` of 6 slots (one bar) or
12 (two), one 8th per token: it counts "1 2 3 4 5 6" with the big beats 1 and 4 marked, the click
on every 8th (BPM counts 8ths). An exercise in `\ts (6 8)` gets the same 6/8 strum row.
**Slash chords**: `G/B`, `G/F#`, `C/B`, `C/G`, `D/C`, `D/F#`, `Am/G`, `F/C` (slug `g-over-b`): the
chord over another bass note, the lowest note played. Multi-paragraph callouts:

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
- `chords`: chord ids or names from `chords.ts`, in order of first appearance; for every exercise that plays
  chords. Pin a voicing with `@` (`"F@1-3-3-2-1-1"`) when the first one is not the one played.
- `strum`: the pattern in `::strum` syntax (8th-note slots, e.g. `"D - D - D - D -"` for 4 downs; 16ths one
  beat per token, `"D-DU D-DU D-DU D-DU"`); required when the exercise is strummed. It must be one or two
  bars of the score's `\ts`, and every bar must strum exactly its slots (a tied push is a miss).
- `\tuning`: a score may set an alternate tuning, high string first as alphaTex wants it
  (`\tuning (D4 A3 G3 D3 A2 D2)` is DADGAD). It must be a tuner preset (Drop D, DADGAD, Open G, Open D):
  the exercise page then shows "Tuning: DADGAD — retune first" with a link to the tuner set to it, and the
  tab's string names follow the tuning.

Fretting fingers: `5.6{lf 2}` (alphaTex counts the thumb as 1: `lf 2` index … `lf 5` pinky; shown
1–4 above the tab). Legato: `{h}` on the **first** note marks a hammer-on _and_ a pull-off (`5.3{h} 7.3`
draws H, `7.3{h} 5.3` draws P; there is no pull-off marker). Percussion: `{s}` slap (S) and `{p}` pop,
a string snap (P), on the beat; dead notes `x.4`; `{txt "K"}` for a kick. `score.atex` needs a `\tempo` (the ladder scales playback from it)
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
{x_strum: D - D - D -}  8th-note slots as ::strum (D U -; no 16ths), one bar (4/6/8) or two (×2)
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
- `{ "atex": "\\tempo 80\n…", "chords": ["G@3-2-0-0-3-3"], "strum": "D - D - D - D -" }`: an inline tab
  (needs `\tempo`; plays from `startBpm`), chord diagrams (a name or `Name@voicing-id`), the strum row;
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
