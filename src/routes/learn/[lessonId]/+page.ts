import { error } from '@sveltejs/kit';
import { loadLearnIndex, loadLearnProgress, loadLesson } from '$lib/learn/client';

export async function load({ fetch, params }) {
	const [index, progress] = await Promise.all([loadLearnIndex(fetch), loadLearnProgress(fetch)]);
	const at = index.lessons.findIndex((l) => l.id === params.lessonId);
	if (at < 0) error(404, 'Lesson not found');
	// The body and the scores of its exercises (cached by the service worker once opened).
	const payload = await loadLesson(fetch, params.lessonId);
	return {
		index,
		progress,
		lesson: payload.lesson,
		exercises: payload.exercises,
		prev: index.lessons[at - 1] ?? null,
		next: index.lessons[at + 1] ?? null
	};
}
