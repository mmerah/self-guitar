import { json } from '@sveltejs/kit';
import { DEFAULT_PROFILE_ID, getDb } from '$lib/server/db';
import { getGoals, queryObject } from '$lib/server/session';
import { dayQuerySchema, parse } from '$lib/server/validate';

/** The weekly goal ring: settings, this week's days and minutes, streak. */
export function GET({ url }) {
	const { date } = parse(dayQuerySchema, queryObject(url, []));
	return json(getGoals(getDb(), DEFAULT_PROFILE_ID, date));
}
