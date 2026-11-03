import { error } from '@sveltejs/kit';
import { loadExercise, loadLearnIndex } from '$lib/learn/client';

export async function load({ fetch, params, url }) {
	// Only what the page needs: the curriculum (precached) and this exercise's ladder position.
	const [index, detail] = await Promise.all([
		loadLearnIndex(fetch),
		loadExercise(fetch, params.id)
	]);
	const exercise = index.exercises.find((e) => e.id === params.id);
	if (!exercise) error(404, 'Exercise not found');
	const fromId = url.searchParams.get('from');
	const from = index.lessons.find((l) => l.id === fromId) ?? null;
	return { exercise, detail, from, fromSession: fromId === 'session' };
}
