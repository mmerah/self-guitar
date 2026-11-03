import { error } from '@sveltejs/kit';
import { loadLearnIndex, loadLearnProgress } from '$lib/learn/client';

export async function load({ fetch, params }) {
	const [index, progress] = await Promise.all([loadLearnIndex(fetch), loadLearnProgress(fetch)]);
	const at = index.lessons.findIndex((l) => l.id === params.lessonId);
	if (at < 0) error(404, 'Lesson not found');
	return {
		index,
		progress,
		lesson: index.lessons[at],
		prev: index.lessons[at - 1] ?? null,
		next: index.lessons[at + 1] ?? null
	};
}
