import { json } from '@sveltejs/kit';
import { DEFAULT_PROFILE_ID, getDb } from '$lib/server/db';
import { queryObject, sessionOfDay } from '$lib/server/session';
import { dayQuerySchema, parse } from '$lib/server/validate';

/** The latest session of the learner's day (null if none): GET /api/session/today?date=… */
export function GET({ url }) {
	const { date } = parse(dayQuerySchema, queryObject(url, []));
	return json(sessionOfDay(getDb(), DEFAULT_PROFILE_ID, date));
}
