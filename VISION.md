# Self-Guitar — Vision

## 1. Purpose
A self-hosted, mobile-first web app that takes an adult learner from "some patchy basics"
to expert on **acoustic guitar**, through a structured curriculum and daily 10–20 minute
practice sessions, with a Songsterr-quality interactive tablature player at its heart.

Guiding principles:
- **Visual first.** Tab, chord diagrams and fretboards everywhere; text is secondary.
- **The app decides what to practice today.** Open it, press *Start*, play for 15 minutes.
- **Deterministic & offline.** All content is pre-authored and versioned in git. No AI at runtime.
- **Free content only.** Public-domain / openly licensed material + our own exercises.
- **Phone first**, graceful on tablet (landscape player) and desktop (wide layouts).

## 2. Users & context
- Single user per install (family profiles later), English UI, practicing on a phone or tablet propped on a stand.
- Hosted on a home server via Docker; accessed over LAN / Tailscale / reverse proxy.
- No in-app auth for v1 (the proxy/VPN is the boundary). Data model keeps a `profile_id`
  so family profiles can be added later without migration pain.
- Public repository with a static demo on GitHub Pages (progress kept in the visitor's browser).

## 3. Core experiences

### 3.1 Today (home screen)
- One big **Start session** button producing a 10–20 min plan (length chosen with a slider).
- Session template (scaled to length): warm-up 10% · technique / chord changes 25% ·
  new skill 30% · spaced review 15% · song 20%.
- Each block is a full-screen card with a timer, metronome, and the relevant visual
  (tab snippet, chord diagram, fretboard). After each block: quick self-rating
  (😖 / 🙂 / 😎 + "clean at BPM ___"), which feeds the scheduler.
- Weekly goal ring (minutes + blocks done) instead of a punishing daily streak; streak freezes.

### 3.2 Learn (curriculum)
- A **skill tree** of levels → units → lessons, with suggested order and **soft gates**:
  mastery checks unlock the next level, but anything can be opened anytime.
- A lesson = short Markdown text + embedded interactive widgets (tab exercise, chord
  diagram, fretboard overlay, strum-pattern player, metronome) + a mastery check.
- Four pillars mirrored from exam boards (RGT/LCM, RSL, Trinity): **pieces, technique,
  reading/improvisation, ear & theory**. Ear/theory runs alongside every level.

### 3.3 Play (song library & tab player) — the Songsterr-like part
- Horizontal scrolling tab with rhythm stems, moving beat cursor, auto-scroll.
- Standard notation toggle (off by default; reading is taught in later levels).
- Controls: play/pause, tempo 25–150 %, A–B loop by dragging over bars, count-in,
  metronome, per-track mute/solo/volume, tap a beat to seek.
- **Speed trainer**: loop a section, auto-increase tempo +4 BPM after N clean passes
  (self-confirmed by a tap), drop back on "miss".
- **Synced chord sheet** for strummed songs: lyrics with chords above, strum pattern
  strip, chord diagrams bar, scrolling in sync with playback (ChordPro source).
- Library filters: level, style (folk/strumming, classical, blues), technique, key.

### 3.4 Tools
- **Tuner** (standard + alternate tunings: Drop D, DADGAD, Open G/D), needle view (strobe view: planned, M5).
- **Metronome** (accent patterns, subdivisions, tap tempo).
- **Chord library** (diagrams, voicings, play the chord), **scale/fretboard explorer**
  (CAGED shapes, pentatonic boxes, note names, intervals).
- **Ear trainer** (intervals → chord quality → progressions), built in-house.
- **Chord-change timer** ("1-minute changes": count changes between a pair, track best).

### 3.5 Progress
- Per-skill status: new → learning → mastered → review-due (expanding intervals 1/3/7/14/30 d).
- History charts: practice minutes, BPM records per exercise, changes/min per chord pair.
- Mastery checks are recorded with value + date; level badges on completion.

## 4. Curriculum backbone (v1 target)
Styles emphasized: **strumming / singer-songwriter, classical / folk, blues / improvisation**.
Mastery numbers are our own targets, tuned during use.

| Lvl | Theme | Key content | Example mastery check |
|---|---|---|---|
| 0 | Setup | Tuning, posture, reading tab/chord diagrams, pick vs fingers | Tune ±5 cents unaided |
| 1 | Open chords I | A D E Em Am C G, down-strums, 1-min changes | 30 changes/min per pair; ¼ strums @70 |
| 2 | Rhythm I | 8th strums, D-DU-UDU, Dm, Fmaj7/mini-F, capo, 12-bar form | 2 min pattern @80 nonstop; 50 changes/min |
| 3 | Fingerstyle I | p-i-m-a, arpeggios, alternating bass, Travis, 1st-position notes | Travis C–G–Am @70 |
| 4 | Barre & harmony | E/A-shape barres, 7/sus/add9, keys, I–IV–V–vi | Barre changes 40/min; diatonic chords in 5 keys |
| 5 | Blues & lead | Pentatonic (5 pos.), hammer/pull/slide/bend, shuffle, 12-bar blues | Pentatonic 8ths @100; improvise 12 bars |
| 6 | Fretboard | CAGED, triads, major scale 3 pos., 16th strumming, syncopation | Any chord in 3 positions; 16ths @90 |
| 7 | Classical/folk studies | Carcassi/Sor/Giuliani studies, solo arrangements, harmonics, DADGAD/open tunings, reading notation | One study at marked tempo |
| 8 | Advanced acoustic | Percussive techniques, jazz/extended chords, modes, blues fingerstyle | Groove @90 steady; modal solo |
| 9 | Expert | Arranging a folk tune solo, transcription by ear, sight-reading, performance set | 3-piece set; transcribe 16 bars |

Practice science applied: deliberate practice (short targeted blocks + immediate feedback),
block new material / interleave review, tempo ramps from ~65% of target, spaced review.

## 5. Content strategy
All content lives in `content/` as plain files and is compiled to a JSON index at build time.

- **Lessons**: Markdown + front-matter (`id, level, unit, skills, prerequisites, mastery`)
  with custom directives for widgets, e.g. `::tab{src="ex-travis-1.atex"}`, `::chord{name="G"}`.
- **Exercises**: hand-written / generated **alphaTex** (scales, chord changes, strum and
  picking patterns) — copyright-free, parameterised by tempo/key.
- **Songs** (strumming): **ChordPro** `song.cho` sheets of public-domain/traditional songs; the
  strummed accompaniment is generated from chords + strum + bar grid (`content/README.md`).
- **Warm-ups**: 2–5 minute routines of steps (stretch timer, tab, strum, exercise ladder).
- **Repertoire sources** (importer scripts in `scripts/import/`; license recorded per file):

| Source | Format | License | Use |
|---|---|---|---|
| Mutopia Project | LilyPond/MIDI | PD / CC BY-SA | Classical guitar (Sor, Giuliani, Carcassi) |
| PDMX (MuseScore) | MusicXML | PD / CC0 (drop `license_conflict`) | Filtered guitar/folk subset |
| TheSession-data | ABC | ODbL, **no LLM processing** | Folk melodies: local import only (see policy) |
| IMSLP | PDF | PD | Reference for hand-typesetting studies |
| Wikibooks Guitar, Open Music Theory, Sight-Reading for Guitar | text | CC BY(-SA) | Lesson text source material, attributed |

- **Auto-fingering**: MusicXML/MIDI → tab via a dynamic-programming fingering pass
  (inspired by `tuttut`), preferring low positions and open strings for beginner levels.
- Every content item carries `source`, `license`, `attribution`; an Attributions page lists them.
- AI may assist authoring offline (drafting lessons/exercises), always human-reviewed and
  validated by parsing with alphaTab in CI. TheSession-derived data is excluded from any AI step.

**Content policy.** The repository is public, so only redistributable content is committed:
public domain, CC0, CC BY, CC BY-SA, or our own work (code MIT, lessons CC BY-SA 4.0, song
arrangements CC0). Personal-use sources (ClassTab: no licence; TheSession: its no-LLM clause)
may only ever be imported locally, by scripts, into the data volume: never committed, never in
the demo.

## 6. Architecture

```
[ Phone / Tablet / Desktop browser — installable PWA ]
   SvelteKit (Svelte 5, TS) UI
   ├─ alphaTab (tab/notation render, alphaSynth playback, cursor, loop, mixer)
   ├─ svguitar (chord diagrams) + custom SVG fretboard
   ├─ Audio: pitchy (tuner) in AudioWorklet · lookahead metronome in Worker
   ├─ localStorage outbox (offline session writes) · Workbox service worker
   │    (Dexie/IndexedDB progress store: planned, M5)
            │  JSON API (sync)
[ Docker container: SvelteKit adapter-node ]
   ├─ SQLite (Drizzle ORM) — profiles, progress, sessions, records
   ├─ /content (compiled lessons, alphaTex, ChordPro, GP/MusicXML)
   └─ /data volume (sqlite db, imported files) — backed up (Litestream or cron)
```

- **Frontend**: SvelteKit + TypeScript; Tailwind for layout; mobile breakpoints first.
  alphaTab wrapped in a single `<TabPlayer>` component (Canvas renderer on long scores).
- **Offline**: precache app shell + SoundFont (~9 MB SF3); cache songs/lessons on first open;
  `navigator.storage.persist()`; progress written locally then synced.
- **Backend**: thin; serves content and persists progress. No external network calls.
- **Deploy**: `docker compose up -d`, one service, one volume, healthcheck.
- **Tests**: Vitest (scheduler, fingering, parsers), Playwright (mobile viewport flows),
  content CI (every alphaTex/ChordPro/MusicXML file must parse).

### Data model (sketch)
`profile` · `skill(id, level, unit)` · `lesson(id, skills[])` · `exercise(id, lesson_id, target_bpm)` ·
`attempt(exercise_id, date, bpm, rating, metric)` · `skill_state(skill_id, status, due_at, ease)` ·
`session(date, planned_min, actual_min, blocks[])` · `song(id, source, license, level, style)` ·
`song_progress(song_id, best_bpm_pct, loops[])`.

### Session planner (core algorithm)
Inputs: chosen length, current level's unfinished lessons, skills with `due_at <= today`,
weak exercises (low ratings), a song at or slightly below level. Fills the template
blocks greedily by priority, never more than one brand-new concept per session.

## 7. Audio & listening (phased)
- **v1**: tuner (MPM via pitchy, clarity gate ≥0.9, median smoothing, per-string range);
  metronome; self-rating everywhere. Mic constraints: echoCancellation/noiseSuppression/AGC off.
- **v2**: single-note exercise checking (onset + pitch) with lenient timing (±50 ms "perfect",
  ±120 ms "ok") after per-device latency calibration (tap-along).
- **v3 (experimental)**: expected-chord verification via chroma matching; offline
  transcription of the learner's own recordings with Basic Pitch → MIDI → auto-fingered tab.
- iOS caveats to handle: AudioContext started from a tap, silent-switch muting
  (`navigator.audioSession`), mic re-permission in standalone PWA, wired output advised.

## 8. UX & visual design
- Dark-by-default, high-contrast fretboard colors; large touch targets (≥44 px), thumb-reach controls.
- Player: portrait = tab + bottom control bar; landscape/tablet = wider systems + side mixer.
- Finger colors consistent everywhere (index/middle/ring/pinky/thumb) across diagrams, tab, fretboard.
- Screen Wake Lock during sessions; haptic tick on metronome downbeat (where supported).
- Minimal reading: each lesson screen fits on a phone without scrolling past the widget.

## 9. Roadmap
**Done so far**: M0–M4.6, M5 part 1 and M6 part 1 (fretboard explorer, ear trainer, L4–L9 units/skills, widgets).

- **M0 – Skeleton**: SvelteKit + Docker + SQLite + PWA shell; content pipeline & CI validation.
- **M1 – Player**: alphaTab `<TabPlayer>` with cursor, tempo, loop, count-in, mixer, notation toggle;
  library page; 10 seed pieces (PD folk + classical).
- **M2 – Tools**: tuner, metronome, chord library, chord-change timer.
- **M3 – Curriculum L0–L3**: lessons, exercises, mastery checks, skill tree, progress store.
- **M4 – Today**: session planner, spaced review, weekly goals, history charts.
- **M4.5 – Public demo**: static GitHub Pages build (SQLite/WASM in the browser), licensing.
- **M5 – Songs**: part 1 done (ChordPro sheets with synced playback and transpose, warm-up routines,
  Library tabs, Mutopia/PDMX importers with auto-fingering); part 2: ~100 sheets, ~60 imported tabs.
- **M6 – Curriculum L4–L9**: part 1 done (fretboard explorer + quiz, adaptive ear trainer, ::fretboard /
  ::ear / ::song widgets, ear and fretboard mastery checks); part 2: the L4–L9 lessons.
- **M7 – Listening v2/v3**, latency calibration, recording & self-review.

## 10. Non-goals (v1)
- Copyrighted songs, scraping Songsterr/Ultimate Guitar, or any paid catalog.
- Runtime AI/LLM features. Video lessons. Social/sharing features. Native app stores.
- Electric-specific content (amps, effects); bass/ukulele.

## 11. Success criteria
- A learner practises ≥5 days/week for 3 months using only this app's "Start session".
- The tab player feels as smooth as Songsterr on a mid-range phone (60 fps scroll, <2 s to play).
- Levels 0–3 complete with measurable mastery records; their changes/min and BPM trend upward.

## 12. Open questions
- SoundFont choice: acoustic steel guitar quality vs size (test 2–3 SF2/SF3 banks).
- Whether to add backing audio (real recordings) per song, with time-stretch (signalsmith-stretch).
