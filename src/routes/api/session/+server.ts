import { error, json } from '@sveltejs/kit';
import { DEFAULT_PROFILE_ID, getDb } from '$lib/server/db';
import {
	getPlan,
	openSession,
	SessionConflict,
	startInputSchema,
	startSession,
	targetProblem
} from '$lib/server/session';
import { getLearnIndex } from '$lib/server/songs';
import { body, parse } from '$lib/server/validate';

/** The session in progress, if any (resuming on another device): GET /api/session */
export function GET() {
	return json(openSession(getDb(), DEFAULT_PROFILE_ID));
}

/**
 * Starts a session with the previewed plan (or a fresh one). The id comes from the client, so a
 * retried or offline-queued start is stored once; an id another profile uses is a 409.
 */
export async function POST({ request }) {
	const input = parse(startInputSchema, await body(request));
	const index = getLearnIndex();
	const db = getDb();
	const blocks = input.blocks ?? getPlan(db, DEFAULT_PROFILE_ID, index, input).blocks;
	for (const b of blocks) {
		const problem = targetProblem(b, index);
		if (problem) error(400, `${b.title}: ${problem}`);
	}
	try {
		return json(startSession(db, DEFAULT_PROFILE_ID, { ...input, blocks }), { status: 201 });
	} catch (e) {
		if (e instanceof SessionConflict) error(409, 'This session id is already in use');
		throw e;
	}
}
