import { json } from '@sveltejs/kit';
import { getLearnIndex } from '$lib/server/songs';

/** The compiled curriculum (levels, lessons, exercises). Precached by the service worker. */
export function GET() {
	return json(getLearnIndex());
}
