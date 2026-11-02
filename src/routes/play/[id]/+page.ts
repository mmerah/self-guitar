import { getJson, getOptional } from '$lib/api';
import type { Song } from '$lib/content/schema';
import type { Progress } from '$lib/progress';

export async function load({ fetch, params }) {
	const id = encodeURIComponent(params.id);
	const [song, progress] = await Promise.all([
		getJson<Song>(fetch, `/api/songs/${id}`, 'Song not found'),
		getOptional<Progress | null>(fetch, `/api/songs/${id}/progress`, null)
	]);
	return { song, progress };
}
