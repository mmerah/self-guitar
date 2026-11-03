// The self-hosted database: better-sqlite3 in DATA_DIR, migrated from drizzle/ at startup.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '$lib/core/db/schema';
import { seedProfile, type Db } from '$lib/core/db';

export { DEFAULT_PROFILE_ID, type Db } from '$lib/core/db';

/** Opens (creating if needed) a database, applies migrations and seeds the default profile. */
export function openDb(file: string): Db {
	if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
	const sqlite = new Database(file);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: process.env.MIGRATIONS_DIR ?? path.resolve('drizzle') });
	seedProfile(db);
	return db;
}

let instance: Db | undefined;

export function getDb(): Db {
	instance ??= openDb(path.join(process.env.DATA_DIR ?? './data', 'self-guitar.db'));
	return instance;
}
