import { error, json } from '@sveltejs/kit';
import { DEFAULT_PROFILE_ID, getDb } from '$lib/server/db';
import { exerciseDetail } from '$lib/server/learn';
import { getLearnIndex } from '$lib/server/songs';

/** One exercise's stats and the ladder's exact position (for the practice page). */
export function GET({ params }) {
	const ex = getLearnIndex().exercises.find((e) => e.id === params.id);
	if (!ex) error(404, 'Exercise not found');
	return json(exerciseDetail(getDb(), DEFAULT_PROFILE_ID, ex));
}
