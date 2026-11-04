import { loadSongCredits } from '$lib/api';

export async function load({ fetch }) {
	return { songs: await loadSongCredits(fetch) };
}
