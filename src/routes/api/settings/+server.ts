import { json } from '@sveltejs/kit';
import { DEFAULT_PROFILE_ID, getDb } from '$lib/server/db';
import { getSettings, saveSettings, settingsSchema } from '$lib/server/session';
import { body, parse } from '$lib/server/validate';

/** Weekly goal (days × minutes) and default session length. */
export function GET() {
	return json(getSettings(getDb(), DEFAULT_PROFILE_ID));
}

export async function PUT({ request }) {
	const input = parse(settingsSchema, await body(request));
	return json(saveSettings(getDb(), DEFAULT_PROFILE_ID, input));
}
