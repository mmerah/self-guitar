import { error, json } from '@sveltejs/kit';
import { DEFAULT_PROFILE_ID, getDb } from '$lib/server/db';
import { getProgress, progressInputSchema, saveProgress } from '$lib/server/progress';
import { getSong } from '$lib/server/songs';

function requireSong(id: string) {
	const song = getSong(id);
	if (!song) error(404, 'Song not found');
	return song;
}

export function GET({ params }) {
	requireSong(params.id);
	return json(getProgress(getDb(), DEFAULT_PROFILE_ID, params.id));
}

export async function PUT({ params, request }) {
	const song = requireSong(params.id);
	const body = await request.json().catch(() => null);
	const parsed = progressInputSchema.safeParse(body);
	if (!parsed.success) error(400, parsed.error.issues.map((i) => i.message).join('; '));
	if (parsed.data.loopEndBar !== null && parsed.data.loopEndBar >= song.bars) {
		error(400, `loop must be within the song's ${song.bars} bars`);
	}
	return json(saveProgress(getDb(), DEFAULT_PROFILE_ID, params.id, parsed.data));
}
