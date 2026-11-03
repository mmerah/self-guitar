import fs from 'node:fs';
import path from 'node:path';
import type { Song, SongSummary } from '$lib/content/schema';
import type { LearnIndex } from '$lib/learn/types';

// Compiled by `npm run content:build`; read from disk (not bundled) so content can change without
// rebuilding the server code.
const CONTENT_FILE = process.env.CONTENT_FILE ?? path.resolve('generated/content.json');

let byId: Map<string, Song> | undefined;
let summaries: SongSummary[] = [];
let learn: LearnIndex = { levels: [], lessons: [], exercises: [] };

function load() {
	if (byId) return byId;
	const content = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8')) as {
		songs: Song[];
		learn: LearnIndex;
	};
	byId = new Map(content.songs.map((s) => [s.id, s]));
	summaries = content.songs
		.map(({ tex: _tex, ...meta }) => meta)
		.sort((a, b) => a.level - b.level || a.title.localeCompare(b.title));
	learn = content.learn;
	return byId;
}

export function listSongs(): SongSummary[] {
	load();
	return summaries;
}

export function getSong(id: string): Song | undefined {
	return load().get(id);
}

/** The compiled curriculum: levels, lessons and exercises. */
export function getLearnIndex(): LearnIndex {
	load();
	return learn;
}

/** Reads the content file now, so a missing build fails at startup rather than on a request. */
export const loadContent = load;
