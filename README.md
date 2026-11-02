# Self-Guitar

A self-hosted, mobile-first web app (PWA) for learning **acoustic guitar** from beginner to
expert: a structured curriculum, daily 10–20 minute guided practice sessions, and a
Songsterr-style interactive tab player for public-domain repertoire.

> Status: **planning**. See [VISION.md](VISION.md) for the full product vision and roadmap.

## Features (planned)
- **Today**: one tap starts a personalised session (warm-up → technique → new skill → review → song).
- **Learn**: skill tree, levels 0–9 (open chords → rhythm → fingerstyle → barre → blues →
  fretboard → classical/folk studies → advanced acoustic), soft-gated by mastery checks.
- **Play**: scrolling tab with cursor, tempo, A–B loop, count-in, mixer, notation toggle,
  speed trainer, synced lyrics + chord sheets.
- **Tools**: tuner, metronome, chord library, fretboard explorer, chord-change timer, ear trainer.
- **Progress**: spaced review, BPM / changes-per-minute records, weekly goals.
- Works offline; all audio processing stays on the device.

## Stack
SvelteKit (Svelte 5, TypeScript) · [alphaTab](https://alphatab.net) (tab rendering & playback) ·
svguitar (chord diagrams) · pitchy (tuner) · SQLite + Drizzle · Workbox PWA · Docker.

## Content
Lessons are Markdown with embedded widgets; exercises are alphaTex; songs are ChordPro,
alphaTex, Guitar Pro or MusicXML. Sources: our own exercises, ClassTab, Mutopia, PDMX,
TheSession, plus Wikibooks / Open Music Theory for reference text. Each file records its
source and license (see `content/` and the in-app Attributions page). Private repository;
some bundled material is for personal use only.

## Quick start (once implemented)
```sh
git clone <repo> && cd self-guitar
docker compose up -d        # serves on http://localhost:3000
```
Put it behind your reverse proxy or Tailscale; the app has no built-in authentication.

## Development (once implemented)
```sh
npm install
npm run dev          # app at http://localhost:5173
npm run content:check  # validate all lessons/tabs/songs parse
npm test
```
