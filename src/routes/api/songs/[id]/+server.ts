import { error, json } from '@sveltejs/kit';
import { getSong } from '$lib/server/songs';

export function GET({ params }) {
	const song = getSong(params.id);
	if (!song) error(404, 'Song not found');
	return json(song);
}
