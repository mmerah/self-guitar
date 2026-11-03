import { json } from '@sveltejs/kit';
import { DEFAULT_PROFILE_ID, getDb } from '$lib/server/db';
import { getPlan, planQuerySchema, queryObject } from '$lib/server/session';
import { getLearnIndex } from '$lib/server/songs';
import { parse } from '$lib/server/validate';

/** Today's plan for a length: GET /api/session/plan?minutes=15&date=2026-11-03&tz=-60 */
export function GET({ url }) {
	const q = parse(planQuerySchema, queryObject(url, ['minutes']));
	return json(getPlan(getDb(), DEFAULT_PROFILE_ID, getLearnIndex(), q));
}
