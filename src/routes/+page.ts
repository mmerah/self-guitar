import { getOptional, loadAllProgress } from '$lib/api';
import type { SongSummary } from '$lib/content/schema';

// Prerendered as the offline app shell; data loads in the browser (ssr is off).
export const prerender = true;

/** "Continue" card: the most recently played song, if any. */
export async function load({ fetch }) {
	const [progress, songs] = await Promise.all([
		loadAllProgress(fetch),
		getOptional<SongSummary[]>(fetch, '/api/songs', [])
	]);
	const recent = progress.find((p) => p.lastPlayedAt);
	const song = recent && songs.find((s) => s.id === recent.songId);
	return {
		continue: recent && song ? { ...recent, title: song.title, pickup: song.pickup } : null
	};
}
