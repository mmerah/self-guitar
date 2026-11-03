import { building } from '$app/environment';
import { getDb } from '$lib/server/db';
import { loadContent } from '$lib/server/content';

// Create/migrate the SQLite database and read the content at server startup (not while
// prerendering during the build).
export function init() {
	if (building) return;
	getDb();
	loadContent();
}
