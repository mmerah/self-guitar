import { json } from '@sveltejs/kit';
import { DEFAULT_PROFILE_ID, getDb } from '$lib/server/db';
import { listProgress } from '$lib/server/progress';

/** Saved progress for every song touched so far, most recently played first. */
export function GET() {
	return json(listProgress(getDb(), DEFAULT_PROFILE_ID));
}
