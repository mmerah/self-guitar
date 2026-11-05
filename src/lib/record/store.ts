// The takes, in IndexedDB: metadata in `takes`, the audio in `chunks` (one row per few seconds
// of recording, so a long take is on disk as it grows and a closed tab loses at most one chunk),
// and lesson "attach a recording" links in `attachments`. Browser-local in both builds.
import type { ItemType, Take, TakeInput } from './types';

export const DB_NAME = 'self-guitar-recordings';
const VERSION = 1;
const TAKES = 'takes';
const CHUNKS = 'chunks';
const ATTACH = 'attachments';
/** A take still marked "recording" this long after its last chunk was left by a closed tab. */
export const STALE_MS = 15_000;

type ChunkRow = { takeId: string; seq: number; data: ArrayBuffer };
export type Attachment = { lessonId: string; takeId: string };
type StoredTake = Take & { updatedAt: number };

let opening: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
	opening ??= new Promise<IDBDatabase>((resolve, reject) => {
		if (typeof indexedDB === 'undefined') return reject(new Error('No IndexedDB in this browser'));
		const req = indexedDB.open(DB_NAME, VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(TAKES)) db.createObjectStore(TAKES, { keyPath: 'id' });
			if (!db.objectStoreNames.contains(CHUNKS))
				db.createObjectStore(CHUNKS, { keyPath: ['takeId', 'seq'] });
			if (!db.objectStoreNames.contains(ATTACH))
				db.createObjectStore(ATTACH, { keyPath: 'lessonId' });
		};
		req.onsuccess = () => {
			const db = req.result;
			db.onversionchange = () => {
				db.close();
				opening = undefined;
			};
			resolve(db);
		};
		req.onerror = () => reject(req.error);
		req.onblocked = () => reject(new Error('IndexedDB is blocked'));
	}).catch((e) => {
		opening = undefined;
		throw e;
	});
	return opening;
}

/** Runs `fn` in one transaction; resolves with its result once committed. */
async function tx<T>(
	stores: string[],
	mode: IDBTransactionMode,
	fn: (t: IDBTransaction) => Promise<T> | T
): Promise<T> {
	const db = await open();
	return new Promise<T>((resolve, reject) => {
		const t = db.transaction(stores, mode);
		let result: T;
		let failed: unknown;
		Promise.resolve(fn(t)).then(
			(r) => (result = r),
			(e) => {
				failed = e;
				try {
					t.abort();
				} catch {
					// already finished
				}
			}
		);
		t.oncomplete = () => (failed ? reject(failed) : resolve(result));
		t.onerror = t.onabort = () => reject(failed ?? t.error);
	});
}

const req = <T>(r: IDBRequest<T>) =>
	new Promise<T>((resolve, reject) => {
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => reject(r.error);
	});

// ---- change notices (counts, the library, the Progress card) ----------------------------------

const listeners = new Set<() => void>();
/** Calls `fn` after any change to the takes; returns the unsubscribe. */
export function onTakesChanged(fn: () => void): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}
function changed() {
	for (const fn of listeners) fn();
}

// ---- takes -------------------------------------------------------------------------------------

export function newId(): string {
	try {
		return crypto.randomUUID();
	} catch {
		return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
	}
}

const strip = ({ updatedAt: _u, ...t }: StoredTake): Take => t;

/** Starts a take (status "recording", no audio yet). */
export async function createTake(input: TakeInput): Promise<Take> {
	const now = Date.now();
	const take: StoredTake = {
		...input,
		id: input.id ?? newId(),
		createdAt: input.createdAt ?? now,
		duration: 0,
		size: 0,
		chunks: 0,
		status: 'recording',
		updatedAt: now
	};
	await tx([TAKES], 'readwrite', (t) => req(t.objectStore(TAKES).put(take)));
	changed();
	return strip(take);
}

/** Appends one audio chunk and the take's running length, in one transaction. */
export async function appendChunk(id: string, data: ArrayBuffer, duration: number): Promise<void> {
	await tx([TAKES, CHUNKS], 'readwrite', async (t) => {
		const takes = t.objectStore(TAKES);
		const take = (await req(takes.get(id))) as StoredTake | undefined;
		if (!take) throw new Error('This take was deleted');
		const row: ChunkRow = { takeId: id, seq: take.chunks, data };
		t.objectStore(CHUNKS).put(row);
		take.chunks++;
		take.size += data.byteLength;
		take.duration = Math.max(take.duration, duration);
		take.updatedAt = Date.now();
		takes.put(take);
	});
}

/**
 * The recording ended: final length and waveform peaks, status "done". A take with no audio is
 * removed.
 */
export async function finishTake(
	id: string,
	duration?: number,
	peaks?: number[]
): Promise<Take | null> {
	const out = await tx([TAKES, CHUNKS], 'readwrite', async (t) => {
		const takes = t.objectStore(TAKES);
		const take = (await req(takes.get(id))) as StoredTake | undefined;
		if (!take) return null;
		if (!take.chunks) {
			takes.delete(id);
			return null;
		}
		take.status = 'done';
		if (duration !== undefined && duration > 0) take.duration = duration;
		if (peaks?.length) take.peaks = peaks;
		take.updatedAt = Date.now();
		takes.put(take);
		return strip(take);
	});
	changed();
	return out;
}

/** Name, rating, note (the review sheet), lazily computed peaks; '' or null clears a field. */
export async function updateTake(
	id: string,
	patch: {
		[K in 'name' | 'rating' | 'note' | 'duration' | 'offsetMs' | 'peaks']?: Take[K] | null;
	}
): Promise<Take | null> {
	const out = await tx([TAKES], 'readwrite', async (t) => {
		const takes = t.objectStore(TAKES);
		const take = (await req(takes.get(id))) as StoredTake | undefined;
		if (!take) return null;
		for (const [k, v] of Object.entries(patch)) {
			if (v === undefined) continue;
			if (v === '' || v === null) delete (take as Record<string, unknown>)[k];
			else (take as Record<string, unknown>)[k] = v;
		}
		take.updatedAt = Date.now();
		takes.put(take);
		return strip(take);
	});
	changed();
	return out;
}

const chunkRange = (id: string) => IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);

export async function deleteTake(id: string): Promise<void> {
	await tx([TAKES, CHUNKS, ATTACH], 'readwrite', async (t) => {
		t.objectStore(TAKES).delete(id);
		t.objectStore(CHUNKS).delete(chunkRange(id));
		const att = (await req(t.objectStore(ATTACH).getAll())) as Attachment[];
		for (const a of att) if (a.takeId === id) t.objectStore(ATTACH).delete(a.lessonId);
	});
	changed();
}

export async function deleteAllTakes(): Promise<void> {
	await tx([TAKES, CHUNKS, ATTACH], 'readwrite', (t) => {
		t.objectStore(TAKES).clear();
		t.objectStore(CHUNKS).clear();
		t.objectStore(ATTACH).clear();
	});
	changed();
}

/** Takes being recorded in this tab (never finalised as stale). */
const live = new Set<string>();
export const markLive = (id: string, on: boolean) => (on ? live.add(id) : live.delete(id));

/**
 * Every take, newest first. A take left "recording" by a closed or crashed tab is finalised
 * (its chunks are complete files up to the last one written); one without audio is dropped.
 */
export async function listTakes(now = Date.now()): Promise<Take[]> {
	const all = (await tx([TAKES], 'readonly', (t) =>
		req(t.objectStore(TAKES).getAll())
	)) as StoredTake[];
	const stale = all.filter(
		(t) => t.status === 'recording' && !live.has(t.id) && now - t.updatedAt > STALE_MS
	);
	for (const t of stale) {
		const done = await finishTake(t.id).catch(() => null);
		if (done) Object.assign(t, done);
		else t.chunks = -1;
	}
	return all
		.filter((t) => t.chunks !== -1)
		.map(strip)
		.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getTake(id: string): Promise<Take | null> {
	const t = (await tx([TAKES], 'readonly', (t) => req(t.objectStore(TAKES).get(id)))) as
		StoredTake | undefined;
	return t ? strip(t) : null;
}

/**
 * The take's audio as one Blob: its chunks in order, under the take's mime. The chunks are the
 * timeslices of ONE MediaRecorder session (see recorder.ts), so they join into one valid file:
 * WebM clusters after one header, or (Safari) fragmented MP4, ftyp+moov then moof+mdat pairs.
 */
export async function takeBlob(id: string): Promise<Blob | null> {
	const take = await getTake(id);
	if (!take) return null;
	const rows = (await tx([CHUNKS], 'readonly', (t) =>
		req(t.objectStore(CHUNKS).getAll(chunkRange(id)))
	)) as ChunkRow[];
	rows.sort((a, b) => a.seq - b.seq);
	return new Blob(
		rows.map((r) => r.data),
		{ type: take.mime || 'audio/webm' }
	);
}

/** Takes of one item (newest first). */
export async function takesFor(itemType: ItemType, itemId: string): Promise<Take[]> {
	return (await listTakes()).filter((t) => t.itemType === itemType && t.itemId === itemId);
}

export type TakeGroup = {
	key: string;
	itemType: ItemType;
	itemId: string;
	title: string;
	takes: Take[];
};

/** Groups by item, the group with the newest take first; takes newest first in each. */
export function groupTakes(takes: Take[]): TakeGroup[] {
	const groups = new Map<string, TakeGroup>();
	for (const t of [...takes].sort((a, b) => b.createdAt - a.createdAt)) {
		const key = `${t.itemType}:${t.itemId}`;
		let g = groups.get(key);
		if (!g) {
			g = { key, itemType: t.itemType, itemId: t.itemId, title: t.title, takes: [] };
			groups.set(key, g);
		}
		g.takes.push(t);
	}
	return [...groups.values()];
}

export const totalSize = (takes: Take[]) => takes.reduce((a, t) => a + t.size, 0);

// ---- lesson attachments (mastery self-checks) ---------------------------------------------------

export async function attachTake(lessonId: string, takeId: string | null): Promise<void> {
	await tx([ATTACH], 'readwrite', (t) =>
		takeId
			? req(t.objectStore(ATTACH).put({ lessonId, takeId } satisfies Attachment))
			: req(t.objectStore(ATTACH).delete(lessonId))
	);
	changed();
}

export async function attachmentFor(lessonId: string): Promise<string | null> {
	const a = (await tx([ATTACH], 'readonly', (t) => req(t.objectStore(ATTACH).get(lessonId)))) as
		Attachment | undefined;
	return a?.takeId ?? null;
}

/** Closes the connection (tests reset the database between cases). */
export async function closeDb() {
	const p = opening;
	opening = undefined;
	if (p) (await p.catch(() => null))?.close();
}
