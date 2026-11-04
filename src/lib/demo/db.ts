// The static demo's database: SQLite compiled to WebAssembly (sql.js), driven by the same
// Drizzle schema, migrations and queries as the self-hosted server. Its bytes live in this
// browser's IndexedDB:
// - one tab owns them at a time (./lock);
// - saved right after each successful write (a microtask later, so a burst is one save) and
//   when the page is hidden with unsaved writes; a tab that wrote nothing never saves. A save
//   starts its IndexedDB transaction at once, but a hard kill (crash, killed process) within
//   milliseconds of a write can still lose that write;
// - never overwritten after a failure: an unreadable store runs the demo in memory without
//   saving, and a snapshot that cannot be opened is copied to `db.bak.<time>` before starting
//   fresh.
import initSqlJs, { type Database } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { drizzle } from 'drizzle-orm/sql-js';
import indexUrl from '../../../generated/content-index.json?url';
import creditsUrl from '../../../generated/song-credits.json?url';
import journal from '../../../drizzle/meta/_journal.json';
import * as schema from '$lib/core/db/schema';
import { seedProfile, type Db } from '$lib/core/db';
import { setContentIndex, type ContentIndex } from '$lib/core/content';
import type { Song, SongCredit } from '$lib/content/schema';
import type { Exercise, LessonPayload } from '$lib/learn/types';
import { idbClear, idbGet, idbPut } from './idb';
import { claim, onHandoff, onMessage, post, reloadOnTakeover, usesLocks } from './lock';
import { demoStatus } from './status.svelte';

const KEY = 'db';

/**
 * Each song's own file (score and sheet), fetched when the song is opened: the demo starts with
 * the small index only. Hashed asset URLs, cached by the service worker on first use.
 */
const SONG_URLS = Object.fromEntries(
	Object.entries(
		import.meta.glob<string>('/generated/songs/*.json', {
			query: '?url',
			import: 'default',
			eager: true
		})
	).map(([file, url]) => [file.replace(/^.*\/(.*)\.json$/, '$1'), url])
);

/** Each lesson's payload and each exercise's score, fetched when opened (cached by the worker). */
const LEARN_URLS = Object.fromEntries(
	Object.entries(
		import.meta.glob<string>('/generated/learn/*.json', {
			query: '?url',
			import: 'default',
			eager: true
		})
	).map(([file, url]) => [file.replace(/^.*\/(.*)\.json$/, '$1'), url])
);

async function loadLearnFile<T>(name: string): Promise<T | undefined> {
	const url = LEARN_URLS[name];
	if (!url) return undefined;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${name}: ${res.status}`);
	return (await res.json()) as T;
}

async function loadSong(id: string): Promise<Song | undefined> {
	const url = SONG_URLS[id];
	if (!url) return undefined;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`song ${id}: ${res.status}`);
	return (await res.json()) as Song;
}

/** drizzle/*.sql in journal order, like drizzle-kit's migrator (tracked by `when`). */
const SQL_FILES = import.meta.glob<string>('/drizzle/*.sql', {
	query: '?raw',
	import: 'default',
	eager: true
});
const MIGRATIONS = journal.entries.map((e) => {
	const text = SQL_FILES[`/drizzle/${e.tag}.sql`];
	if (text === undefined) throw new Error(`drizzle/${e.tag}.sql is missing`);
	return { when: e.when, text };
});

/** localStorage keys the app writes (on a shared github.io origin: only ours are removed). */
const LOCAL_KEYS = /^(sg:|changes:|tuner:|metronome:|player\.|demo-|theme$)/;

let sqlite: Database | undefined;
let ready: Promise<Db> | undefined;
/** Written since the last save. */
let dirty = false;
/** The store could not be read (or a bad snapshot could not be backed up): never save. */
let readOnly = false;
/** Saves wait while > 0 (an open transaction must not be exported half-done). */
let holds = 0;
let saveQueued = false;
/** Another tab saved (no Web Locks): reload our copy before the next request. */
let stale = false;
let started = false;

const sha256 = async (text: string) =>
	[...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');

const scalar = (s: Database, q: string) => s.exec(q)[0]?.values[0]?.[0];

/**
 * Applies the missing migrations, recording each in `__drizzle_migrations` (hash, created_at) as
 * drizzle-orm's migrator does. Snapshots from before that table counted the applied migrations in
 * `PRAGMA user_version`: those count as the first N journal entries (once).
 */
async function migrate(s: Database) {
	const hashes = await Promise.all(MIGRATIONS.map((m) => sha256(m.text)));
	s.run(
		'CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)'
	);
	const record = (i: number) =>
		s.run('INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)', [
			hashes[i],
			MIGRATIONS[i].when
		]);
	const legacy = Number(scalar(s, 'PRAGMA user_version') ?? 0);
	if (legacy > 0) {
		s.run('BEGIN');
		for (let i = 0; i < Math.min(legacy, MIGRATIONS.length); i++) record(i);
		s.run('PRAGMA user_version = 0');
		s.run('COMMIT');
	}
	const applied = new Set(
		(s.exec('SELECT created_at FROM "__drizzle_migrations"')[0]?.values ?? []).map((r) =>
			Number(r[0])
		)
	);
	for (const [i, m] of MIGRATIONS.entries()) {
		if (applied.has(m.when)) continue;
		s.run('BEGIN');
		try {
			for (const stmt of m.text.split('--> statement-breakpoint')) if (stmt.trim()) s.run(stmt);
			record(i);
			s.run('COMMIT');
		} catch (e) {
			s.run('ROLLBACK');
			throw e;
		}
	}
}

function fresh(SQL: initSqlJs.SqlJsStatic, bytes?: Uint8Array) {
	const s = new SQL.Database(bytes);
	s.run('PRAGMA foreign_keys = ON');
	return s;
}

/** The saved snapshot; undefined when there is none, or the store is unreadable (read-only). */
async function readSnapshot(): Promise<Uint8Array | undefined> {
	try {
		return await idbGet<Uint8Array>(KEY);
	} catch (e) {
		console.warn('Demo storage is unavailable: progress will not be saved', e);
		readOnly = true;
		demoStatus.storage = 'unavailable';
		return undefined;
	}
}

/** Opens the snapshot; one that fails is backed up under its own key before starting fresh. */
async function openSnapshot(SQL: initSqlJs.SqlJsStatic, saved: Uint8Array | undefined) {
	if (saved) {
		let s: Database | undefined;
		try {
			s = fresh(SQL, saved);
			await migrate(s);
			return s;
		} catch (e) {
			s?.close();
			console.warn('Demo database could not be opened', e);
			try {
				await idbPut(`db.bak.${Date.now()}`, saved);
				demoStatus.notice =
					'Your saved demo progress could not be opened, so the demo started fresh. A backup copy is kept in this browser.';
			} catch {
				readOnly = true;
				demoStatus.storage = 'unavailable';
			}
		}
	}
	const s = fresh(SQL);
	await migrate(s);
	return s;
}

async function init(): Promise<Db> {
	start();
	await claim();
	const [SQL, content, saved] = await Promise.all([
		initSqlJs({ locateFile: () => wasmUrl }),
		fetch(indexUrl).then((r) => {
			if (!r.ok) throw new Error(`content: ${r.status}`);
			return r.json() as Promise<ContentIndex>;
		}),
		readSnapshot()
	]);
	setContentIndex(
		content,
		loadSong,
		(id) => loadLearnFile<LessonPayload>(`lesson-${id}`),
		(id) => loadLearnFile<Exercise>(`exercise-${id}`),
		async () => {
			const res = await fetch(creditsUrl);
			if (!res.ok) throw new Error(`credits: ${res.status}`);
			return (await res.json()) as SongCredit[];
		}
	);
	sqlite?.close();
	sqlite = await openSnapshot(SQL, saved);
	const d = drizzle(sqlite, { schema }) as unknown as Db;
	// Inside an outer transaction (the sample seed), the handlers' own transactions nest.
	const plain = d.transaction.bind(d);
	d.transaction = ((fn: (tx: Db) => unknown, config?: never) => {
		if (!holds) return plain(fn as never, config);
		sqlite!.run('SAVEPOINT nested');
		try {
			const out = fn(d);
			sqlite!.run('RELEASE nested');
			return out;
		} catch (e) {
			sqlite!.run('ROLLBACK TO nested');
			sqlite!.run('RELEASE nested');
			throw e;
		}
	}) as Db['transaction'];
	seedProfile(d);
	return d;
}

function start() {
	if (started) return;
	started = true;
	const hidden = () => {
		if (dirty) void save();
	};
	addEventListener('pagehide', hidden);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') hidden();
	});
	onHandoff(async () => {
		await save();
		sqlite?.close();
		sqlite = undefined;
		// Requests wait under the notice; taking the database back reloads the page.
		ready = new Promise(() => {});
	});
	onMessage((m) => {
		// Another tab reset the demo: reload (behind the notice: on taking the database back).
		if (m.type === 'reset') {
			if (usesLocks()) reloadOnTakeover();
			else location.reload();
		} else if (m.type === 'saved' && !usesLocks()) {
			stale = true;
			demoStatus.otherTab = true;
		}
	});
}

/** The database, once this tab owns it and it is open (content loaded, migrations applied). */
export function demoDb(): Promise<Db> {
	if (stale) {
		stale = false;
		if (!dirty) ready = undefined;
	}
	ready ??= init().catch((e) => {
		ready = undefined;
		throw e;
	});
	return ready;
}

/** After a successful write: saves a microtask later (one save per burst of writes). */
export function scheduleSave() {
	dirty = true;
	if (saveQueued) return;
	saveQueued = true;
	queueMicrotask(() => {
		saveQueued = false;
		void save();
	});
}

/** Saves now if anything changed. Failures keep the changes marked unsaved and show a banner. */
function save(): Promise<void> {
	if (!dirty || readOnly || holds || !sqlite) return Promise.resolve();
	dirty = false;
	const bytes = sqlite.export();
	// export() reopens the connection, which resets per-connection pragmas.
	sqlite.run('PRAGMA foreign_keys = ON');
	return idbPut(KEY, bytes).then(
		() => {
			if (demoStatus.storage !== 'unavailable') demoStatus.storage = 'ok';
			post({ type: 'saved' });
		},
		(e: unknown) => {
			dirty = true;
			demoStatus.storage =
				e instanceof DOMException && e.name === 'QuotaExceededError' ? 'quota' : 'failed';
			console.warn('Demo progress could not be saved in this browser', e);
		}
	);
}

/**
 * Runs `fn` as one transaction (BEGIN/COMMIT, ROLLBACK on error) with saves held until it ends,
 * then saves what it wrote. A rolled-back run leaves nothing to save.
 */
export async function atomically<T>(fn: () => Promise<T>): Promise<T> {
	const s = sqlite;
	if (!s) throw new Error('The demo database is not open');
	const wasDirty = dirty;
	holds++;
	s.run('BEGIN');
	try {
		const out = await fn();
		s.run('COMMIT');
		return out;
	} catch (e) {
		s.run('ROLLBACK');
		dirty = wasDirty;
		throw e;
	} finally {
		holds--;
		if (dirty) void save();
	}
}

/**
 * Forgets everything the demo stored in this browser: the database (snapshot and backups), the
 * app's local keys and the open copy; other tabs reload. Never throws: false when the stored
 * database could not be deleted. The caller reloads the page.
 */
export async function resetDemo(): Promise<boolean> {
	dirty = false;
	readOnly = true; // nothing from this page's copy may be saved again
	sqlite?.close();
	sqlite = undefined;
	ready = undefined;
	try {
		await idbClear();
		return true;
	} catch (e) {
		console.warn('Demo database could not be deleted', e);
		return false;
	} finally {
		for (const store of [() => localStorage, () => sessionStorage]) {
			try {
				const s = store();
				for (const k of Object.keys(s)) if (LOCAL_KEYS.test(k)) s.removeItem(k);
			} catch {
				// storage blocked: nothing was stored there either
			}
		}
		post({ type: 'reset' });
	}
}
