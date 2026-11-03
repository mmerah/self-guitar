import { error, json } from '@sveltejs/kit';
import { DEFAULT_PROFILE_ID, getDb } from '$lib/server/db';
import { attemptInputSchema, attemptProblem, recordAttempt } from '$lib/server/learn';
import { getLearnIndex } from '$lib/server/songs';

/** Records one tempo-ladder pass (bpm, clean); returns the exercise's stats and ladder position. */
export async function POST({ params, request }) {
	const index = getLearnIndex();
	const ex = index.exercises.find((e) => e.id === params.id);
	if (!ex) error(404, 'Exercise not found');
	const parsed = attemptInputSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, parsed.error.issues.map((i) => i.message).join('; '));
	const problem = attemptProblem(ex, parsed.data);
	if (problem) error(400, problem);
	return json(recordAttempt(getDb(), DEFAULT_PROFILE_ID, ex, parsed.data, index), { status: 201 });
}
