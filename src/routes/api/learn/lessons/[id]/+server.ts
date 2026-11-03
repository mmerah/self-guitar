import { error, json } from '@sveltejs/kit';
import { DEFAULT_PROFILE_ID, getDb } from '$lib/server/db';
import {
	getLearnProgress,
	lessonStatusInputSchema,
	setLessonStatus,
	syncSkillStates
} from '$lib/server/learn';
import { getLearnIndex } from '$lib/server/songs';

/** Marks a lesson started or completed; returns the updated progress. */
export async function PUT({ params, request }) {
	const index = getLearnIndex();
	if (!index.lessons.some((l) => l.id === params.id)) error(404, 'Lesson not found');
	const parsed = lessonStatusInputSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, parsed.error.issues.map((i) => i.message).join('; '));
	const db = getDb();
	setLessonStatus(db, DEFAULT_PROFILE_ID, params.id, parsed.data.status);
	syncSkillStates(db, DEFAULT_PROFILE_ID, index);
	return json(getLearnProgress(db, DEFAULT_PROFILE_ID, index));
}
