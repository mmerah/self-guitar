# Chord sheets: the Self-Guitar ChordPro subset

A strummed song is one `content/songs/<id>/song.cho`. It is the **single source** for:

1. the lyrics + chords view;
2. the generated `score.atex` strummed accompaniment that drives playback, the click and line highlighting;
3. the chord-diagram bar, built from `content/chords.ts`.

`meta.json` stays as it is. Its `title`, `composer`, `level` and `key` are checked against the `.cho` directives. An optional hand-written melody track can live in `melody.atex`.

Prototype: `chordpro-to-atex.mjs` in this folder. It parses this subset and emits alphaTex. Both worked examples below generate output that passes the repo's own `checkAlphaTex` (bar sums, diagnostics):

| Output                               | Bars |
| ------------------------------------ | ---: |
| `examples/drunken-sailor.gen.atex`   |   33 |
| `examples/scarborough-fair.gen.atex` |   68 |

## 1. Supported directives

Directive names follow ChordPro 6, so standard tools (chordpro.org, OnSong and others) can still read our files. Anything of our own uses the spec's `x_` prefix, which other tools ignore.

| Directive                                                         | Meaning                                   | Notes                                                                                   |
| ----------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| `{title: …}` (`{t:}`)                                             | Song title                                | Must equal `meta.title`                                                                 |
| `{artist: …}` / `{composer: …}` / `{lyricist: …}`                 | Credits                                   | For trad. songs: `Traditional (<country>)`                                              |
| `{key: Am}`                                                       | Key of the chord **shapes**               | With a capo, the sounding key is computed                                               |
| `{capo: 2}`                                                       | Capo fret, 0–7                            | UI shows "Capo 2 – sounds in B minor"                                                   |
| `{tempo: 96}`                                                     | BPM (quarter note; dotted quarter in 6/8) | Base tempo for the ladder and playback                                                  |
| `{time: 3/4}`                                                     | 2/4, 3/4, 4/4, 6/8                        | Matches `::strum` slot counts (4/6/8/6)                                                 |
| `[Am]` inline                                                     | Chord at that syllable                    | Display only; timing comes from the grid                                                |
| `{start_of_verse label="…"}` / `{end_of_verse}` (`{sov}`/`{eov}`) | Verse block                               |                                                                                         |
| `{start_of_chorus}` / `{end_of_chorus}` (`{soc}`/`{eoc}`)         | Chorus block                              |                                                                                         |
| `{chorus}`                                                        | Recall the last chorus                    | Rendered collapsed ("Chorus ×1")                                                        |
| `{start_of_grid label="…"}` … `{end_of_grid}`                     | **Bar structure** (ChordPro 6 grid)       | Rule: one cell per beat, `.` continues the chord, `                                     | ` is a barline. Grid line _n_ belongs to lyric line _n_ of each block. |
| `{comment: …}` (`{c:}`)                                           | Performance note                          | Shown in italics                                                                        |
| `{x_strum: D - D U - U D U}`                                      | Strum pattern in our **`::strum` syntax** | Slots are 8ths (4/6/8 per bar, or 12/16 for 2 bars). Set at file level, then per block. |
| `{x_level: 1}`                                                    | Curriculum level                          | Cross-checked with `meta.level`                                                         |
| `{x_end: Em}`                                                     | Final whole-bar ring-out chord            | Optional                                                                                |
| `{x_source: …}` / `{x_license: …}`                                | Provenance                                | Copied into the Attributions page                                                       |
| `{x_voicing: G=320033}`                                           | Pin a voicing for this song               | Defaults to the first voicing in `chords.ts`                                            |

Everything else is either ignored with a warning or a hard error:

- **Warning, then ignored:** `{define}`, `{chordfont}`, tab and ABC blocks, conditional directives.
- **Error:** any chord the song uses that is not in `chords.ts`.

### Strum syntax (shared with `::strum`)

- `D` is a down-strum on all strings of the voicing. `U` is an up-strum on the top 3 strings. `-` is a miss: the hand still moves, and the previous strum rings on.
- **Extension (needs a small widget change):**
  - `B`: the bass note (lowest voiced string of the chord).
  - `b`: the alternate bass (next string up, or the 5th).
  - Together they give boom-chick patterns such as `B - D U b - D U`.
- **Lint rule:** the number of slots must match `{time}`.

## 2. How it syncs to playback

**Generation.** At `content:build` time, or in `tools/songs/cho-to-atex.ts`:

1. **Grid → bars.** The `{start_of_grid}` lines are parsed into bars of beat cells. With a 4/4 pattern of 8 slots and 4 cells, each cell covers 2 slots. So `| D . Em . |` is D for slots 1–4 and Em for slots 5–8.
2. **Plan.** Walk the blocks in file order (verse, chorus, `{chorus}` recall). Each block plays the grid once with its own `x_strum`. A block may have its own grid when it differs, such as a chorus with other chords.
3. **Strum → beats.** Per slot:
   - `D` writes `(voicing){bd}`.
   - `U` writes `(top 3 strings){bu}`.
   - `-` extends the previous beat. The durations merge: 1 slot = `:8`, 2 = `:4`, 3 = `:4{d}`, 4 = `:2`.
   - Chord names go on the first strum of each new chord and at every section start, as `{ch "Em"}`.
   - Sections become `\section "Verse"` / `"Chorus"`.
4. **Voicings.** Taken from `content/chords.ts` (frets low → high, e.g. `x02210` → `(0.5 2.4 2.3 1.2 0.1)`). A capo is applied by shifting nothing in the tab: the shapes stay the same, and playback adds a transposition of +capo (`\staff` transpose / `transpositionPitch`).
5. **Validation.**
   - Every lyric line's sequence of chord changes must equal its grid line's. A chord carried over from the previous line is allowed.
   - Strum slots must fit `{time}`.
   - `checkAlphaTex` must give an empty result.
   - Each chord must exist in `chords.ts`.
6. **Output.** `score.atex` carries a header comment `// generated from song.cho – do not edit`. CI regenerates it and diffs.

**Runtime sync.**

- alphaTab's `playerPositionChanged` gives the current **bar index**. A map built at generation time turns it into (block, line, bar-in-line) as `[{bar: 0, block: 0, line: 0}, …]`, so the UI knows the current lyric line and which chord is sounding.
- The current chord's diagram is highlighted in the chord bar. The _next_ chord gets a small "next" badge one beat before the change.
- Tapping a lyric line seeks to its first bar: `api.tickPosition = masterBars[bar].start`.
- The tempo ladder, the metronome and "count-in 1 bar" reuse the existing exercise machinery.

### Example: generated chorus bar 4 of _Drunken Sailor_ (`D - D U - U D U`, grid `| D . Em . |`)

```
:4 (0.4 2.3 3.2 2.1){bd ch "D"} :8 (0.4 2.3 3.2 2.1){bd} :4 (2.3 3.2 2.1){bu}
:8 (0.3 0.2 0.1){bu ch "Em"} :8 (0.6 2.5 2.4 0.3 0.2 0.1){bd} :8 (0.3 0.2 0.1){bu} |
```

The verse (`D - D - D - D -`) generates the same notes and rhythm as today's hand-written `content/songs/drunken-sailor/score.atex`. The only difference is the added `{bd}` brush marks.

## 3. Rendering on a phone (360–430 px wide)

```
┌──────────────────────────────┐
│ Drunken Sailor     ♩=90  ⏵ ⟲ │  sticky header: title, tempo ladder, play/loop
│ [Em][D]  capo 0 · D - D U…   │  chord bar: mini diagrams (tap = big diagram + sound)
├──────────────────────────────┤
│ CHORUS                       │
│ Em                           │
│ Way hay and up she rises,    │  ← current line: tinted background, bold chord
│ D                            │
│ Way hay and up she rises,    │
│ …                            │
└──────────────────────────────┘
```

- **Compact layout.**
  - The chord sits above the syllable in a two-row line box. Use a monospace-free layout: each `[Chord]` splits the line into a segment, rendered as an inline-block with the chord on top and the text below. This is the standard ChordPro HTML approach and wraps naturally.
  - A segment never splits across lines. If a line overflows, wrap at segment boundaries and indent the continuation.
  - Chord names are 15 px bold in an accent colour; lyrics are 17 px. Line height 1.25 inside a line and 0.6 em between lines.
  - Lines with no chord drop the chord row.
- **Chord diagram bar.**
  - Sticky under the header, holding the song's unique chords in order of first use.
  - Diagrams are 44 px wide, from the existing chord-diagram component.
  - The current chord is outlined; the next chord gets a dot.
  - Scrolls horizontally if there are more than 6 chords.
- **Current-line highlight.** The background tint and a left bar move with playback (see sync). Under `prefers-reduced-motion`, swap the tint without animation.
- **Auto-scroll.**
  - During playback, keep the current line at about 30 % of the viewport height using `scrollIntoView({block: 'center'})` with an offset. Scrolling is smooth unless reduced motion is set.
  - Auto-scroll pauses for 4 s after the user scrolls by hand, and a "Follow" pill brings it back.
  - With no playback ("strum along"), the user can pick a scroll speed derived from tempo × bars per line.
- **Repeat handling.** `{chorus}` recall renders as a collapsible "Chorus" chip. During playback it expands in place so the highlight has a target.
- **Capo / transpose.** A toggle shows either shapes (default) or sounding chords. A transpose control is not in M5; it would need movable shapes.
- **Lyrics-off mode.** Shows only the grid as bars (`| Em . . . | D . . . |`), which suits practising changes.
- **Accessibility.** The lyrics are real text. Chords get `aria-label="chord E minor"`. The highlight is announced politely only when playback starts and stops, not on every line.

---

## 4. Worked example 1: _Drunken Sailor_ (trad.)

Text: traditional shanty text as printed in Whall (1910) and Terry (1921). This is a public-domain traditional text, and the verses are the common traditional ones.

```chordpro
{title: Drunken Sailor}
{composer: Traditional (sea shanty)}
{key: Em}
{capo: 0}
{tempo: 90}
{time: 4/4}
{x_level: 1}
{x_strum: D - D - D - D -}
{x_source: Traditional; text as in 19th-century shanty collections (Whall 1910, Terry 1921)}
{x_license: Traditional (public domain); arrangement CC0}

{start_of_grid label="Verse"}
| Em . . . | D . . . | Em . . . | D . Em . |
{end_of_grid}

{start_of_verse label="Verse 1"}
[Em]What will we do with a drunken sailor,
[D]What will we do with a drunken sailor,
[Em]What will we do with a drunken sailor,
[D]Earl-y in the [Em]morning?
{end_of_verse}

{start_of_chorus}
{x_strum: D - D U - U D U}
[Em]Way hay and up she rises,
[D]Way hay and up she rises,
[Em]Way hay and up she rises,
[D]Earl-y in the [Em]morning.
{end_of_chorus}

{start_of_verse label="Verse 2"}
[Em]Put him in the longboat till he's sober,
[D]Put him in the longboat till he's sober,
[Em]Put him in the longboat till he's sober,
[D]Earl-y in the [Em]morning.
{end_of_verse}

{chorus}

{start_of_verse label="Verse 3"}
[Em]Pull out the bung and wet him all over,
[D]Pull out the bung and wet him all over,
[Em]Pull out the bung and wet him all over,
[D]Earl-y in the [Em]morning.
{end_of_verse}

{chorus}

{start_of_verse label="Verse 4"}
[Em]That's what we do with a drunken sailor,
[D]That's what we do with a drunken sailor,
[Em]That's what we do with a drunken sailor,
[D]Earl-y in the [Em]morning.
{end_of_verse}

{chorus}
{x_end: Em}
```

## 5. Worked example 2: _Scarborough Fair_ (trad.)

Text: the traditional ballad (Child 2), after 19th-century printed versions (Kidson, _Traditional Tunes_, 1891). It deliberately avoids the 1960s Martin Carthy / Simon & Garfunkel wording and their "Canticle" counter-melody. The grid follows the bar structure of today's `content/songs/scarborough-fair/score.atex`: 4 + 4 + 5 + 4 bars, with the third line's pickup bar carrying Em.

```chordpro
{title: Scarborough Fair}
{composer: Traditional (English)}
{key: Am}
{capo: 0}
{tempo: 96}
{time: 3/4}
{x_level: 2}
{x_strum: D - D U D U}
{x_source: Traditional English ballad (Child 2); text after 19th-century printed versions, e.g. Kidson, Traditional Tunes (1891)}
{x_license: Traditional (public domain); arrangement CC0}

{start_of_grid label="Verse"}
| Am . . | Am . . | Em . . | Am . . |
| Am . . | Am . . | D . . | Em . . |
| Em . . | Am . . | G . . | Am . . | G . . |
| Am . . | G . . | Em . . | Am . . |
{end_of_grid}

{start_of_verse label="Verse 1"}
[Am]Are you going to [Em]Scarborough [Am]Fair?
[Am]Parsley, sage, [D]rosemary and [Em]thyme;
Re[Am]member me to [G]one who [Am]lives [G]there,
For [Am]once she [G]was a true [Em]lover of [Am]mine.
{end_of_verse}

{start_of_verse label="Verse 2"}
[Am]Tell her to make me a [Em]cambric [Am]shirt,
[Am]Parsley, sage, [D]rosemary and [Em]thyme;
With[Am]out any seam or [G]fine needle[Am]work, [G]
And [Am]then she [G]shall be a [Em]true love of [Am]mine.
{end_of_verse}

{start_of_verse label="Verse 3"}
[Am]Tell her to wash it in [Em]yonder dry [Am]well,
[Am]Parsley, sage, [D]rosemary and [Em]thyme;
Where [Am]never sprung water nor [G]rain ever [Am]fell, [G]
And [Am]then she [G]shall be a [Em]true love of [Am]mine.
{end_of_verse}

{start_of_verse label="Verse 4"}
[Am]Tell her to dry it on [Em]yonder [Am]thorn,
[Am]Parsley, sage, [D]rosemary and [Em]thyme;
Which [Am]never bore blossom since [G]Adam was [Am]born, [G]
And [Am]then she [G]shall be a [Em]true love of [Am]mine.
{end_of_verse}
```

> Note for the maintainers: the existing `scarborough-fair/score.atex` uses the section label
> "She once was a true love of mine". That is the 1960s phrasing. It is a short phrase and almost certainly
> not protectable, but changing it to the Kidson-style "For once she was a true lover of mine" removes the question.

## 6. Lint rules (add to `content:check`)

1. Every chord name resolves in `chords.ts`; voicing ids given in `x_voicing` exist.
2. The number of `x_strum` slots matches `{time}`: 8 for 4/4, 6 for 3/4 or 6/8, 4 for 2/4; ×2 for two-bar patterns.
3. The number of grid lines equals the number of lyric lines in each block that uses the grid, and the chord-change sequences agree.
4. `{title}`, `{key}` and `{x_level}` agree with `meta.json`. `{capo}` is 0–7 and `{tempo}` is 30–250 (the existing `bpm` bounds).
5. Lyric lines are ≤ 48 characters, so they fit one phone line at 17 px in most cases (a warning, not an error).
6. The generated `score.atex` is up to date: CI regenerates it and compares.
