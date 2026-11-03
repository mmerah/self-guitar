// The compiled content (generated/content.json: songs, lessons, exercises) as the shared logic
// sees it. The server reads it from disk ($lib/server/content), the static demo fetches it as a
// static asset ($lib/demo/shim); either hands it over with setContent before the first request.
import type { Song, SongSummary } from '$lib/content/schema';
import type { LearnIndex } from '$lib/learn/types';

export type Content = { songs: Song[]; learn: LearnIndex };

let byId: Map<string, Song> | undefined;
let summaries: SongSummary[] = [];
let learn: LearnIndex = { levels: [], lessons: [], exercises: [] };
let loader: (() => Content) | undefined;

/** Installs the content (or a lazy loader for it). */
export function setContent(content: Content | (() => Content)) {
	byId = undefined;
	if (typeof content === 'function') loader = content;
	else {
		loader = undefined;
		index(content);
	}
}

function index(content: Content) {
	byId = new Map(content.songs.map((s) => [s.id, s]));
	summaries = content.songs
		.map(({ tex: _tex, ...meta }) => meta)
		.sort((a, b) => a.level - b.level || a.title.localeCompare(b.title));
	learn = content.learn;
}

function load() {
	if (byId) return byId;
	if (!loader) throw new Error('content is not loaded');
	index(loader());
	return byId!;
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

/** Loads the content now, so a missing build fails at startup rather than on a request. */
export const loadContent = load;
