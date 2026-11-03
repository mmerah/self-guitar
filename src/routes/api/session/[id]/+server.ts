import { error, json } from '@sveltejs/kit';
import { DEFAULT_PROFILE_ID, getDb } from '$lib/server/db';
import { getSession } from '$lib/server/session';

export function GET({ params }) {
	const s = getSession(getDb(), DEFAULT_PROFILE_ID, params.id);
	if (!s) error(404, 'Session not found');
	return json(s);
}
