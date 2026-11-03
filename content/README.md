# Content authoring

Everything here is compiled by `npm run content:build` into `generated/content.json`.
Run `npm run content:check` after every edit: it fails on any mistake listed below.

| Path                       | What                                                        |
| -------------------------- | ----------------------------------------------------------- |
| `curriculum.ts`            | Levels → units → skills (ids are stable: never rename one)  |
| `lessons/L<level>/<id>.md` | One lesson: YAML front-matter + Markdown body               |
| `exercises/<id>/meta.json` | Tempo-ladder exercise + `score.atex` (alphaTex, std tuning) |
| `chords.ts`, `songs/<id>/` | Chord voicings; songs (see their own comments)              |

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
