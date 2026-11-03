import { json } from '@sveltejs/kit';
import { DEFAULT_PROFILE_ID, getDb } from '$lib/server/db';
import { getLearnProgress } from '$lib/server/learn';
import { getLearnIndex } from '$lib/server/songs';

/** Lesson states, mastery checks, skill status, exercise stats and the next lesson. */
export function GET() {
	return json(getLearnProgress(getDb(), DEFAULT_PROFILE_ID, getLearnIndex()));
}
