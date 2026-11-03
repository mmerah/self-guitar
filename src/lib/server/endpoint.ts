// Mounts an entry of the shared API table ($lib/core/api) as a SvelteKit endpoint, with the
// self-hosted database and content. The database opens on first use: content routes
// (/api/songs, /api/learn) never touch it.
import type { RequestEvent } from '@sveltejs/kit';
import { routes, type ApiContext, type ApiHandler, type Method, type Route } from '$lib/core/api';
import { getDb } from './db';
import './content';

type Endpoint<R extends Route> = {
	[M in keyof (typeof routes)[R] & Method]: (event: RequestEvent) => Response | Promise<Response>;
};

/** The handler's context for a request: its params, URL and body, and the database (lazily). */
export const context = ({
	params,
	url,
	request
}: Pick<RequestEvent, 'params' | 'url' | 'request'>): ApiContext => ({
	get db() {
		return getDb();
	},
	params: params as Record<string, string>,
	url,
	request
});

export function endpoint<R extends Route>(route: R): Endpoint<R> {
	const out: Record<string, (event: RequestEvent) => Response | Promise<Response>> = {};
	for (const [method, handler] of Object.entries(routes[route]) as [Method, ApiHandler][])
		out[method] = (event) => handler(context(event));
	return out as Endpoint<R>;
}
