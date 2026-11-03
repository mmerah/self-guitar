import { error, json } from '@sveltejs/kit';
import { DEFAULT_PROFILE_ID, getDb } from '$lib/server/db';
import {
	confirmMastery,
	getLearnProgress,
	masteryInputSchema,
	syncSkillStates
} from '$lib/server/learn';
import { getLearnIndex } from '$lib/server/songs';

/** Confirms a self-assessed mastery check (checklist or tuner); returns the updated progress. */
export async function POST({ params, request }) {
	const index = getLearnIndex();
	const lesson = index.lessons.find((l) => l.id === params.id);
	if (!lesson) error(404, 'Lesson not found');
	const parsed = masteryInputSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, parsed.error.issues.map((i) => i.message).join('; '));
	const db = getDb();
	const problem = confirmMastery(db, DEFAULT_PROFILE_ID, lesson, parsed.data.checked);
	if (problem) error(400, problem);
	syncSkillStates(db, DEFAULT_PROFILE_ID, index);
	return json(getLearnProgress(db, DEFAULT_PROFILE_ID, index), { status: 201 });
}
