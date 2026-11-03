import { getOptional } from '$lib/api';
import type { History } from '$lib/server/session';
import { localDate } from '$lib/session/types';

/** History charts (null offline: the page says so). */
export async function load({ fetch }) {
	const date = localDate();
	const tz = new Date().getTimezoneOffset();
	return {
		history: await getOptional<History | null>(fetch, `/api/history?date=${date}&tz=${tz}`, null)
	};
}
