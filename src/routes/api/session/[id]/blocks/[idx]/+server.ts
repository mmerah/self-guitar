import { error, json } from '@sveltejs/kit';
import { DEFAULT_PROFILE_ID, getDb } from '$lib/server/db';
import { blockResultSchema, completeBlock, getSession } from '$lib/server/session';
import { getLearnIndex } from '$lib/server/songs';
import { body, parse } from '$lib/server/validate';
import { dueBy } from '$lib/session/time';

/** Stores a block's result (done or skipped, rating, "clean at BPM"); idempotent. */
export async function PUT({ params, request }) {
	if (!/^\d{1,2}$/.test(params.idx)) error(400, 'idx must be a block number');
	const { tz, ...result } = parse(blockResultSchema, await body(request));
	const db = getDb();
	const session = getSession(db, DEFAULT_PROFILE_ID, params.id);
	if (!session) error(404, 'Session not found');
	const idx = Number(params.idx);
	if (idx >= session.blocks.length) error(400, `idx must be below ${session.blocks.length}`);
	const due = dueBy(session.date, tz);
	return json(completeBlock(db, DEFAULT_PROFILE_ID, params.id, idx, result, getLearnIndex(), due));
}
