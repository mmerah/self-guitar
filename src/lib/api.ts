// Client-side JSON loaders shared by route `load` functions.
import { error } from '@sveltejs/kit';
import { base } from '$app/paths';
import type { SongCredit, SongSummary } from '$lib/content/schema';
import type { Progress } from '$lib/progress';

type Fetch = typeof fetch;

/**
 * Every request to the JSON API goes through here. `path` is the route ('/api/…', with its query);
 * it is served under the app's base path. The static demo build answers it in the browser
 * instead ($lib/demo/shim: the same handlers on an in-browser database).
 */
export function apiFetch(path: string, init?: RequestInit, f: Fetch = fetch): Promise<Response> {
	if (__DEMO__)
		return shim
			? shim.handle(path, init)
			: import('$lib/demo/shim').then((m) => (shim = m).handle(path, init));
	return f(base + path, init);
}
/** The demo's shim once loaded: later requests start in the same task (no import to wait for). */
let shim: typeof import('$lib/demo/shim') | undefined;

/** A JSON write (PUT/POST) through apiFetch. */
export const sendJson = (path: string, method: string, body: unknown, init?: RequestInit) =>
	apiFetch(path, {
		...init,
		method,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});

export const OFFLINE_MESSAGE = 'Not available offline yet';

/** Fetches JSON; network failures (offline and not cached by the service worker) become a 503. */
export async function getJson<T>(fetch: Fetch, url: string, notFound = 'Not found'): Promise<T> {
	let res: Response;
	try {
		res = await apiFetch(url, undefined, fetch);
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
		const res = await apiFetch(url, undefined, fetch);
		return res.ok ? ((await res.json()) as T) : fallback;
	} catch {
		return fallback;
	}
}

export const loadSongList = (fetch: Fetch) => getJson<SongSummary[]>(fetch, '/api/songs');
/** Every song's source and license (the attributions page). */
export const loadSongCredits = (fetch: Fetch) => getJson<SongCredit[]>(fetch, '/api/credits');
export const loadAllProgress = (fetch: Fetch) =>
	getOptional<Progress[]>(fetch, '/api/progress', []);
