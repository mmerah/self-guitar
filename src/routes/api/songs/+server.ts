import { json } from '@sveltejs/kit';
import { listSongs } from '$lib/server/songs';

export function GET() {
	return json(listSongs());
}
