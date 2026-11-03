import { loadAllProgress, loadSongList } from '$lib/api';
import { loadLearnIndex, loadLearnProgress } from '$lib/learn/client';

export async function load({ fetch }) {
	const [songs, progress, index, learn] = await Promise.all([
		loadSongList(fetch),
		loadAllProgress(fetch),
		loadLearnIndex(fetch),
		loadLearnProgress(fetch)
	]);
	return { songs, progress: new Map(progress.map((p) => [p.songId, p])), index, learn };
}
