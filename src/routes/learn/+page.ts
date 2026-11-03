import { loadLearnIndex, loadLearnProgress } from '$lib/learn/client';

export async function load({ fetch }) {
	const [index, progress] = await Promise.all([loadLearnIndex(fetch), loadLearnProgress(fetch)]);
	return { index, progress };
}
