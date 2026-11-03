# Self-Guitar

A self-hosted, mobile-first web app (PWA) for learning **acoustic guitar** from beginner to
expert: a structured curriculum, daily 10–20 minute guided practice sessions, and a
Songsterr-style interactive tab player for public-domain repertoire.

> Status: **M0–M4** (tab player, library, tools, curriculum L0–L3, Today: guided sessions, spaced
> review, weekly goal, progress charts). See [VISION.md](VISION.md).

## Features

- **Today**: one tap starts a planned session (warm-up → new skill → technique → review → song);
  only active time counts, a pedal (PageDown / →) runs it hands-free; spaced review
  (1/3/7/14/30 d), a weekly goal with freezes, and an "Am I improving?" progress page.
- **Learn**: skill tree, levels 0–9, soft-gated by mastery checks; tempo-ladder exercises.
- **Play**: scrolling tab with cursor, tempo, A–B loop, count-in, mixer, notation toggle.
- **Tools**: tuner, metronome, chord library, 1-minute changes (fretboard, ear trainer: later).
- Works offline (session results queue and sync); all audio processing stays on the device.

## Stack

SvelteKit (Svelte 5, TypeScript) · [alphaTab](https://alphatab.net) (tab rendering & playback) ·
svguitar (chord diagrams) · pitchy (tuner) · SQLite + Drizzle · Workbox PWA · Docker.

## Content

Public-domain songs and own exercises (alphaTex); each item records its source and license.

## Quick start

```sh
docker compose up -d --build   # http://localhost:3000, data in the self-guitar-data volume
```

No built-in auth: put it behind your reverse proxy or Tailscale. Healthcheck: `GET /api/health`.
The container runs as uid 1000: a bind-mounted data dir must be writable by it (`chown 1000 ./data`).

## Development (Node 22)

```sh
npm install
npm run dev            # http://localhost:5173 (compiles content/ first)
npm run content:check  # validate songs, lessons, exercises, chords (alphaTex parsed)
npm test               # content:check + Vitest;  npm run test:e2e = build + Playwright
npm run lint && npm run check && npm run build && node build   # production server on :3000 (PORT, DATA_DIR=./data)
```

Songs, lessons and exercises live in `content/` and compile to `generated/content.json` (read at
startup); how to write lessons: [content/README.md](content/README.md). DB schema: edit
`src/lib/server/db/schema.ts`, then `npm run db:generate` (migrations run on startup).
