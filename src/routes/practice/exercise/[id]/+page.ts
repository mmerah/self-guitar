import { error } from '@sveltejs/kit';
import { loadExercise, loadExerciseContent, loadLearnIndex } from '$lib/learn/client';

export async function load({ fetch, params, url }) {
	// Only what the page needs: the curriculum (precached), this exercise's score and its ladder
	// position.
	const [index, detail, exercise] = await Promise.all([
		loadLearnIndex(fetch),
		loadExercise(fetch, params.id),
		loadExerciseContent(fetch, params.id)
	]);
	if (!exercise) {
		if (!index.exercises.some((e) => e.id === params.id)) error(404, 'Exercise not found');
		error(503, 'This exercise is not available offline yet');
	}
	const fromId = url.searchParams.get('from');
	const from = index.lessons.find((l) => l.id === fromId) ?? null;
	return { exercise, detail, from, fromSession: fromId === 'session' };
}
