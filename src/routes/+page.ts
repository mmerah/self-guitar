import { getOptional, loadAllProgress } from '$lib/api';
import { loadLearnProgress } from '$lib/learn/client';
import type { SongSummary } from '$lib/content/schema';

// Prerendered as the offline app shell; data loads in the browser (ssr is off).
export const prerender = true;

/** "Continue" card: the most recently played song, if any; "Learn" card: the next lesson. */
export async function load({ fetch }) {
	const [progress, songs, learn] = await Promise.all([
		loadAllProgress(fetch),
		getOptional<SongSummary[]>(fetch, '/api/songs', []),
		loadLearnProgress(fetch)
	]);
	const recent = progress.find((p) => p.lastPlayedAt);
	const song = recent && songs.find((s) => s.id === recent.songId);
	return {
		continue: recent && song ? { ...recent, title: song.title, pickup: song.pickup } : null,
		nextLesson: learn.next,
		lessonStarted: learn.next ? learn.lessons[learn.next.id]?.state === 'started' : false
	};
}
