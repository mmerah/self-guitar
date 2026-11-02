# Self-Guitar

A self-hosted, mobile-first web app (PWA) for learning **acoustic guitar** from beginner to
expert: a structured curriculum, daily 10–20 minute guided practice sessions, and a
Songsterr-style interactive tab player for public-domain repertoire.

> Status: **M0 + M1** (skeleton, tab player, library). See [VISION.md](VISION.md) for the roadmap.

## Features (planned)

- **Today**: one tap starts a personalised session (warm-up → technique → skill → review → song).
- **Learn**: skill tree, levels 0–9, soft-gated by mastery checks.
- **Play**: scrolling tab with cursor, tempo, A–B loop, count-in, mixer, notation toggle.
- **Tools**: tuner, metronome, chord library, fretboard explorer, ear trainer.
- Works offline; all audio processing stays on the device.

## Stack

SvelteKit (Svelte 5, TypeScript) · [alphaTab](https://alphatab.net) (tab rendering & playback) ·
svguitar (chord diagrams) · pitchy (tuner) · SQLite + Drizzle · Workbox PWA · Docker.

## Content

Public-domain songs and own exercises (alphaTex; later ChordPro, Guitar Pro, MusicXML). Each item
records its source and license (see `content/` and the in-app Attributions page).

## Quick start

```sh
docker compose up -d --build   # http://localhost:3000, data in the self-guitar-data volume
```

No built-in auth: put it behind your reverse proxy or Tailscale. Healthcheck: `GET /api/health`.
The container runs as uid 1000: a bind-mounted data dir must be writable by it
(`chown 1000:1000 ./data`).

## Development (Node 22)

```sh
npm install
npm run dev            # http://localhost:5173 (compiles content/ first)
npm run content:check  # validate meta.json + parse every alphaTex score with alphaTab
npm test               # content:check + Vitest;  npm run test:e2e = build + Playwright
npm run lint && npm run check
npm run build && node build   # production server on :3000 (PORT, DATA_DIR=./data)
```

Songs live in `content/songs/<id>/` (`meta.json` + `score.atex`), compiled to
`generated/content.json` (read at startup). DB schema: edit `src/lib/server/db/schema.ts`,
then `npm run db:generate` (migrations run on startup).
