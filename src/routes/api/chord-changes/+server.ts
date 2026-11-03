import { error, json } from '@sveltejs/kit';
import { DEFAULT_PROFILE_ID, getDb } from '$lib/server/db';
import { changeInputSchema, listChangePairs, saveChangeRecord } from '$lib/server/chordChanges';
import { applyReview, syncSkillStates } from '$lib/server/learn';
import { lessonPairKey, pairKey } from '$lib/chordChanges';
import { getLearnIndex } from '$lib/server/songs';
import { dueBy } from '$lib/session/time';

/** Every practised chord pair: personal best and recent history. */
export function GET() {
	return json(listChangePairs(getDb(), DEFAULT_PROFILE_ID));
}

export async function POST({ request }) {
	const parsed = changeInputSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, parsed.error.issues.map((i) => i.message).join('; '));
	const db = getDb();
	const pair = saveChangeRecord(db, DEFAULT_PROFILE_ID, parsed.data);
	// Changes records count toward lessons' changes checks.
	const index = getLearnIndex();
	syncSkillStates(db, DEFAULT_PROFILE_ID, index);
	// Reaching a lesson's changes goal again is a good review of that lesson's (due) skills.
	const key = pairKey(pair.chordA, pair.chordB);
	const now = Date.now();
	for (const l of index.lessons) {
		const m = l.mastery;
		if (m?.type !== 'changes' || parsed.data.count < m.target || lessonPairKey(m) !== key) continue;
		applyReview(db, DEFAULT_PROFILE_ID, l.skills, true, now, dueBy(undefined, parsed.data.tz, now));
	}
	return json(pair, { status: 201 });
}
