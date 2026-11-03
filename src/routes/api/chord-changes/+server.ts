import { error, json } from '@sveltejs/kit';
import { DEFAULT_PROFILE_ID, getDb } from '$lib/server/db';
import { changeInputSchema, listChangePairs, saveChangeRecord } from '$lib/server/chordChanges';
import { syncSkillStates } from '$lib/server/learn';
import { getLearnIndex } from '$lib/server/songs';

/** Every practised chord pair: personal best and recent history. */
export function GET() {
	return json(listChangePairs(getDb(), DEFAULT_PROFILE_ID));
}

/** Records one 1-minute-changes result; returns the pair's updated best and history. */
export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	const parsed = changeInputSchema.safeParse(body);
	if (!parsed.success) error(400, parsed.error.issues.map((i) => i.message).join('; '));
	const db = getDb();
	const pair = saveChangeRecord(db, DEFAULT_PROFILE_ID, parsed.data);
	// Changes records count toward lessons' changes checks.
	syncSkillStates(db, DEFAULT_PROFILE_ID, getLearnIndex());
	return json(pair, { status: 201 });
}
