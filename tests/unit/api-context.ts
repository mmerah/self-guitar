// Calls an entry of the shared API table ($lib/core/api) the way the server does, with a
// constructed ApiContext on the self-hosted database (DATA_DIR) and content.
import { routes, type ApiHandler, type Route } from '../../src/lib/core/api';
import { context } from '../../src/lib/server/endpoint';

type Ctx = { params?: Record<string, string>; url?: URL; request?: Request };
type Call = (ctx?: Ctx) => Promise<Response>;

export function api(route: Route): Record<'GET' | 'POST' | 'PUT', Call> {
	const methods = routes[route] as Partial<Record<string, ApiHandler>>;
	const call =
		(method: string): Call =>
		async (ctx = {}) => {
			const url = ctx.url ?? new URL(`http://localhost${route}`);
			return methods[method]!(
				context({ params: ctx.params ?? {}, url, request: ctx.request ?? new Request(url) })
			);
		};
	return { GET: call('GET'), POST: call('POST'), PUT: call('PUT') };
}
