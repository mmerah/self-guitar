import { loadLearnIndex } from '$lib/learn/client';

/** The curriculum (precached): exercises and lessons the blocks point at. */
export async function load({ fetch }) {
	return { index: await loadLearnIndex(fetch) };
}
