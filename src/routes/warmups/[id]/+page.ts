import { error } from '@sveltejs/kit';
import { loadLearnIndex } from '$lib/learn/client';

export async function load({ fetch, params }) {
	// The curriculum index is precached: warm-ups open offline.
	const index = await loadLearnIndex(fetch);
	const warmup = index.warmups.find((w) => w.id === params.id);
	if (!warmup) error(404, 'Warm-up not found');
	return { warmup, index };
}
