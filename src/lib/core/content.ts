// The compiled content as the shared logic sees it. The self-hosted server reads all of it
// (generated/content.json) from disk ($lib/server/content); the static demo loads only the index
// (generated/content-index.json: song summaries + the curriculum) and fetches each song's score
// and sheet when it is opened ($lib/demo/db). Either hands it over before the first request.
import type { Song, SongSummary } from '$lib/content/schema';
import { summarize } from '$lib/content/summary';
import type { LearnIndex } from '$lib/learn/types';

export type Content = { songs: Song[]; learn: LearnIndex };
export type ContentIndex = { songs: SongSummary[]; learn: LearnIndex };
type SongLoader = (id: string) => Promise<Song | undefined>;

let byId: Map<string, SongSummary> | undefined;
let summaries: SongSummary[] = [];
let learn: LearnIndex = { levels: [], lessons: [], exercises: [], warmups: [] };
let loader: (() => Content) | undefined;
let songLoader: SongLoader = async () => undefined;

/** Installs the whole content (or a lazy loader for it): every song is in memory. */
export function setContent(content: Content | (() => Content)) {
	byId = undefined;
	const install = (c: Content) => {
		const songs = new Map(c.songs.map((s) => [s.id, s]));
		index({ songs: c.songs.map(summarize), learn: c.learn });
		songLoader = async (id) => songs.get(id);
	};
	if (typeof content === 'function') {
		loader = () => {
			const c = content();
			install(c);
			return c;
		};
	} else {
		loader = undefined;
		install(content);
	}
}

/** Installs the index, with a loader that fetches one song when it is asked for. */
export function setContentIndex(content: ContentIndex, loadSong: SongLoader) {
	loader = undefined;
	index(content);
	songLoader = loadSong;
}

function index(content: ContentIndex) {
	byId = new Map(content.songs.map((s) => [s.id, s]));
	summaries = [...content.songs].sort(
		(a, b) => a.level - b.level || a.title.localeCompare(b.title)
	);
	learn = content.learn;
}

function load() {
	if (byId) return byId;
	if (!loader) throw new Error('content is not loaded');
	loader();
	return byId!;
}

export function listSongs(): SongSummary[] {
	load();
	return summaries;
}

/** A song's list entry (meta, bar count, chords), without its score. */
export function getSongSummary(id: string): SongSummary | undefined {
	return load().get(id);
}

/** A song with its score and sheet. */
export async function getSong(id: string): Promise<Song | undefined> {
	if (!load().has(id)) return undefined;
	return songLoader(id);
}

/** The compiled curriculum: levels, lessons and exercises. */
export function getLearnIndex(): LearnIndex {
	load();
	return learn;
}

/** Loads the content now, so a missing build fails at startup rather than on a request. */
export const loadContent = load;
