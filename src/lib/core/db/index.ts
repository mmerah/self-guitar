// The database as the shared logic sees it: a synchronous Drizzle SQLite instance. The server
// provides one on better-sqlite3 ($lib/server/db), the static demo one on sql.js ($lib/demo/db);
// both run the same schema, migrations and queries.
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import * as schema from './schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = BaseSQLiteDatabase<'sync', any, typeof schema>;

export const DEFAULT_PROFILE_ID = 1;

/** Creates the default profile (idempotent): run after the migrations. */
export function seedProfile(db: Db) {
	db.insert(schema.profile)
		.values({ id: DEFAULT_PROFILE_ID, name: 'Default' })
		.onConflictDoNothing()
		.run();
}
