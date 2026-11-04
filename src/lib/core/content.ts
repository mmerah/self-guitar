// The compiled content as the shared logic sees it. The self-hosted server reads all of it
// (generated/content.json) from disk ($lib/server/content); the static demo loads only the index
// (generated/content-index.json: song summaries + the curriculum without lesson bodies and
// exercise scores) and fetches each song, lesson and exercise when it is opened ($lib/demo/db).
// Either hands it over before the first request. The rules (planner, mastery) only ever see the
// index; lesson bodies and scores go to the pages that show them.
import type { Song, SongCredit, SongSummary } from '$lib/content/schema';
import { creditOf, summarize } from '$lib/content/summary';
import { learnIndexOf, lessonPayload } from '$lib/learn/payload';
import type { Exercise, LearnContent, LearnIndex, LessonPayload } from '$lib/learn/types';

export type Content = { songs: Song[]; learn: LearnContent };
export type ContentIndex = { songs: SongSummary[]; learn: LearnIndex };
type SongLoader = (id: string) => Promise<Song | undefined>;
export type LessonLoader = (id: string) => Promise<LessonPayload | undefined>;
export type ExerciseLoader = (id: string) => Promise<Exercise | undefined>;

export type CreditsLoader = () => Promise<SongCredit[]>;
let creditsLoader: CreditsLoader = async () => [];
let lessonLoader: LessonLoader = async () => undefined;
let exerciseLoader: ExerciseLoader = async () => undefined;

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
		const exercises = new Map(c.learn.exercises.map((e) => [e.id, e]));
		index({ songs: c.songs.map(summarize), learn: learnIndexOf(c.learn) });
		songLoader = async (id) => songs.get(id);
		lessonLoader = async (id) => lessonPayload(c.learn, id);
		const credits = [...c.songs].sort((a, b) => a.title.localeCompare(b.title)).map(creditOf);
		creditsLoader = async () => credits;
		exerciseLoader = async (id) => exercises.get(id);
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

/** Installs the index, with loaders that fetch one song, lesson or exercise when asked for. */
export function setContentIndex(
	content: ContentIndex,
	loadSong: SongLoader,
	loadLesson: LessonLoader = async () => undefined,
	loadExercise: ExerciseLoader = async () => undefined,
	loadCredits: CreditsLoader = async () => []
) {
	loader = undefined;
	index(content);
	songLoader = loadSong;
	lessonLoader = loadLesson;
	exerciseLoader = loadExercise;
	creditsLoader = loadCredits;
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

/** Every song's source and license, by title. */
export async function getSongCredits(): Promise<SongCredit[]> {
	load();
	return creditsLoader();
}

/** A song with its score and sheet. */
export async function getSong(id: string): Promise<Song | undefined> {
	if (!load().has(id)) return undefined;
	return songLoader(id);
}

/** The compiled curriculum: levels, lessons and exercises (no bodies: see getLesson). */
export function getLearnIndex(): LearnIndex {
	load();
	return learn;
}

/** A lesson with its body and the exercises it shows. */
export async function getLesson(id: string): Promise<LessonPayload | undefined> {
	if (!load() || !learn.lessons.some((l) => l.id === id)) return undefined;
	return lessonLoader(id);
}

/** An exercise with its score. */
export async function getExercise(id: string): Promise<Exercise | undefined> {
	if (!load() || !learn.exercises.some((e) => e.id === id)) return undefined;
	return exerciseLoader(id);
}

/** Loads the content now, so a missing build fails at startup rather than on a request. */
export const loadContent = load;
