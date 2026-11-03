import { json } from '@sveltejs/kit';
import { DEFAULT_PROFILE_ID, getDb } from '$lib/server/db';
import { getHistory, queryObject } from '$lib/server/session';
import { getLearnIndex } from '$lib/server/songs';
import { dayQuerySchema, parse } from '$lib/server/validate';

/** Progress charts: minutes per day, BPM records, changes per pair, skills per level, weeks. */
export function GET({ url }) {
	const q = parse(dayQuerySchema, queryObject(url, []));
	return json(getHistory(getDb(), DEFAULT_PROFILE_ID, getLearnIndex(), q.date, q.tz));
}
