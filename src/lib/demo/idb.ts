// A tiny key-value store on IndexedDB (one database, one object store) for the demo's data.
// The connection stays open, so a write starts its transaction synchronously (no await before
// it): a save issued while the page is being hidden is already on its way.
const DB_NAME = 'self-guitar-demo';
const STORE = 'kv';

let conn: IDBDatabase | undefined;
let opening: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
	opening ??= new Promise<IDBDatabase>((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE);
		req.onsuccess = () => {
			conn = req.result;
			// Another tab deleting or upgrading the database: let it.
			conn.onversionchange = () => {
				conn?.close();
				conn = undefined;
				opening = undefined;
			};
			resolve(conn);
		};
		req.onerror = () => reject(req.error);
		req.onblocked = () => reject(new Error('IndexedDB is blocked'));
	}).catch((e) => {
		opening = undefined;
		throw e;
	});
	return opening;
}

function run<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest) {
	return new Promise<T>((resolve, reject) => {
		const tx = db.transaction(STORE, mode);
		const req = fn(tx.objectStore(STORE));
		tx.oncomplete = () => resolve(req.result as T);
		tx.onerror = tx.onabort = () => reject(tx.error ?? req.error);
		// Commit now rather than at the end of the task (the page may be going away).
		if (mode === 'readwrite') tx.commit?.();
	});
}

/** Runs `fn` in a transaction; synchronous up to the request when the connection is open. */
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
	try {
		if (conn) return run<T>(conn, mode, fn);
	} catch (e) {
		// a closing connection: reopen below
		conn = undefined;
		opening = undefined;
		if (!(e instanceof DOMException && e.name === 'InvalidStateError')) return Promise.reject(e);
	}
	return open().then((db) => run<T>(db, mode, fn));
}

export const idbGet = <T>(key: string) => tx<T | undefined>('readonly', (s) => s.get(key));
export const idbPut = (key: string, value: unknown) =>
	tx<void>('readwrite', (s) => s.put(value, key));
/** Deletes every key (the snapshot and any backups). */
export const idbClear = () => tx<void>('readwrite', (s) => s.clear());
