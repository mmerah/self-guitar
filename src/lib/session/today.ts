// Today's plan for the Today page (and its length chips).
import { getOptional } from '$lib/api';
import type { SongSummary } from '$lib/content/schema';
import type { LearnIndex } from '$lib/learn/types';
import { cachedPlan, cachePlan, fallbackPlan, planUrl } from './client';
import { localDate, type Plan } from './types';

export type PlanSource = 'server' | 'cached' | 'fallback';

/** Today's plan from the server; offline, the last plan of that length or a local fallback. */
export async function loadPlan(
	fetch: typeof globalThis.fetch,
	minutes: number,
	next: string | null
): Promise<{ plan: Plan; source: PlanSource }> {
	const date = localDate();
	const plan = await getOptional<Plan | null>(fetch, planUrl(minutes, date), null);
	if (plan) {
		cachePlan(plan);
		return { plan, source: 'server' };
	}
	const cached = cachedPlan(minutes);
	if (cached) return { plan: { ...cached, date }, source: 'cached' };
	const [index, songs] = await Promise.all([
		getOptional<LearnIndex>(fetch, '/api/learn', {
			levels: [],
			lessons: [],
			exercises: [],
			warmups: []
		}),
		getOptional<SongSummary[]>(fetch, '/api/songs', [])
	]);
	return { plan: fallbackPlan(index, songs, minutes, date, next), source: 'fallback' };
}
