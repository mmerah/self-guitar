import fs from 'node:fs';
import path from 'node:path';
import type { Song, SongSummary } from '$lib/content/schema';

// Compiled by `npm run content:build`; read from disk (not bundled) so content can change without
// rebuilding the server code.
const CONTENT_FILE = process.env.CONTENT_FILE ?? path.resolve('generated/content.json');

let byId: Map<string, Song> | undefined;
let summaries: SongSummary[] = [];

function load() {
	if (byId) return byId;
	const { songs } = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8')) as { songs: Song[] };
	byId = new Map(songs.map((s) => [s.id, s]));
	summaries = songs
		.map(({ tex: _tex, ...meta }) => meta)
		.sort((a, b) => a.level - b.level || a.title.localeCompare(b.title));
	return byId;
}

export function listSongs(): SongSummary[] {
	load();
	return summaries;
}

export function getSong(id: string): Song | undefined {
	return load().get(id);
}

/** Reads the content file now, so a missing build fails at startup rather than on a request. */
export const loadContent = load;
