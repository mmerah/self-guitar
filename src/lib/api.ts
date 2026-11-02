// Client-side JSON loaders shared by route `load` functions.
import { error } from '@sveltejs/kit';
import type { SongSummary } from '$lib/content/schema';
import type { Progress } from '$lib/progress';

type Fetch = typeof fetch;

export const OFFLINE_MESSAGE = 'Not available offline yet';

/** Fetches JSON; network failures (offline and not cached by the service worker) become a 503. */
export async function getJson<T>(fetch: Fetch, url: string, notFound = 'Not found'): Promise<T> {
	let res: Response;
	try {
		res = await fetch(url);
	} catch {
		error(503, OFFLINE_MESSAGE);
	}
	if (res.status === 404) error(404, notFound);
	if (!res.ok) error(res.status, navigator.onLine ? 'Could not load data' : OFFLINE_MESSAGE);
	return (await res.json()) as T;
}

/** Same as getJson, but optional data: any failure gives `fallback`. */
export async function getOptional<T>(fetch: Fetch, url: string, fallback: T): Promise<T> {
	try {
		const res = await fetch(url);
		return res.ok ? ((await res.json()) as T) : fallback;
	} catch {
		return fallback;
	}
}

export const loadSongList = (fetch: Fetch) => getJson<SongSummary[]>(fetch, '/api/songs');
export const loadAllProgress = (fetch: Fetch) =>
	getOptional<Progress[]>(fetch, '/api/progress', []);
