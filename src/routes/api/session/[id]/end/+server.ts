import { error, json } from '@sveltejs/kit';
import { DEFAULT_PROFILE_ID, getDb } from '$lib/server/db';
import { endInputSchema, endSession } from '$lib/server/session';
import { getLearnIndex } from '$lib/server/songs';
import { optionalBody, parse } from '$lib/server/validate';

/** Ends a session; returns the summary (minutes, blocks done, PBs, reviews moved, tomorrow). */
export async function POST({ params, request }) {
	const input = parse(endInputSchema, await optionalBody(request));
	const summary = endSession(getDb(), DEFAULT_PROFILE_ID, params.id, getLearnIndex(), input);
	if (!summary) error(404, 'Session not found');
	if (summary === 'early') error(400, 'endedAt must not be before the session started');
	return json(summary);
}
