import { loadSongList } from '$lib/api';

export async function load({ fetch }) {
	return { songs: await loadSongList(fetch) };
}
