import { loadAllProgress, loadSongList } from '$lib/api';

export async function load({ fetch }) {
	const [songs, progress] = await Promise.all([loadSongList(fetch), loadAllProgress(fetch)]);
	return { songs, progress: new Map(progress.map((p) => [p.songId, p])) };
}
