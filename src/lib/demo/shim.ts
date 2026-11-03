// The static demo's "server": answers the app's /api requests in the browser by running the
// shared handlers ($lib/core/api) against the in-browser database. Loaded only by the demo build
// (apiFetch in $lib/api); the self-hosted build replaces $lib/demo with a stub.
import { isHttpError, json } from '@sveltejs/kit';
import { matchRoute } from '$lib/core/api';
import { demoDb, scheduleSave } from './db';

export { demoDb };

let last: Promise<unknown> = Promise.resolve();

/**
 * Answers one API request (`path` is '/api/…' with its query), like the server would. Requests
 * run one at a time, in the order they were made (a block result before the session's end).
 */
export function handle(path: string, init?: RequestInit): Promise<Response> {
	const res = last.then(() => answer(path, init));
	last = res.catch(() => {});
	return res;
}

async function answer(path: string, init?: RequestInit): Promise<Response> {
	const db = await demoDb();
	const url = new URL(path, location.origin);
	const request = new Request(url, { ...init, body: undefined });
	// The body as already-resolved text: reading a Request's stream takes tasks, and a write must
	// reach the database (and its save start) before a page that is closing goes away.
	const text = typeof init?.body === 'string' ? init.body : '';
	Object.defineProperties(request, {
		text: { value: async () => text },
		json: { value: async () => JSON.parse(text) }
	});
	try {
		const match = matchRoute(request.method, url.pathname);
		if (!match) return json({ message: 'Not found' }, { status: 404 });
		if (match === 'method') return json({ message: 'Method not allowed' }, { status: 405 });
		const res = await match.handler({ db, params: match.params, url, request });
		// Saved right after each successful write (not after reads or rejected writes).
		if (res.ok && request.method !== 'GET') scheduleSave();
		return res;
	} catch (e) {
		if (isHttpError(e)) return json(e.body, { status: e.status });
		console.error(e);
		return json({ message: 'Internal Error' }, { status: 500 });
	}
}
