import { error, json } from '@sveltejs/kit';
import { DEFAULT_PROFILE_ID, getDb } from '$lib/server/db';
import { changeInputSchema, listChangePairs, saveChangeRecord } from '$lib/server/chordChanges';

/** Every practised chord pair: personal best and recent history. */
export function GET() {
	return json(listChangePairs(getDb(), DEFAULT_PROFILE_ID));
}

/** Records one 1-minute-changes result; returns the pair's updated best and history. */
export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	const parsed = changeInputSchema.safeParse(body);
	if (!parsed.success) error(400, parsed.error.issues.map((i) => i.message).join('; '));
	return json(saveChangeRecord(getDb(), DEFAULT_PROFILE_ID, parsed.data), { status: 201 });
}
