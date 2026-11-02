import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

export const DEFAULT_PROFILE_ID = 1;

/** Opens (creating if needed) a database, applies migrations and seeds the default profile. */
export function openDb(file: string): Db {
	if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
	const sqlite = new Database(file);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: process.env.MIGRATIONS_DIR ?? path.resolve('drizzle') });
	db.insert(schema.profile)
		.values({ id: DEFAULT_PROFILE_ID, name: 'Default' })
		.onConflictDoNothing()
		.run();
	return db;
}

let instance: Db | undefined;

export function getDb(): Db {
	instance ??= openDb(path.join(process.env.DATA_DIR ?? './data', 'self-guitar.db'));
	return instance;
}
