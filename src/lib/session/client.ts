// Browser side of Today: the running session kept in localStorage (it survives reloads and
// midnight; it is keyed by its id, not by the day), its block clock (only active time counts), a
// small outbox for session writes made offline, and the offline fallback plan.
import type { LearnIndex } from '$lib/learn/types';
import type { SongSummary } from '$lib/content/schema';
import { sendJson } from '$lib/api';
import { planSession } from './planner';
import { clientTz } from './time';
import {
	type BlockResult,
	type Plan,
	type PlanBlock,
	type Rating,
	type SessionSummary,
	type StoredSession
} from './types';

const SESSION_KEY = 'sg:session';
const OUTBOX_KEY = 'sg:outbox';
const PLAN_KEY = 'sg:plan';
const LENGTH_KEY = 'sg:length';

/** What the block surface reported, for the inferred rating and the summary recap. */
export type BlockNote = {
	/** Ladder events in order ('clean', 'miss', 'up', 'down', 'mastered'). */
	ladder?: string[];
	/** Highest clean ladder tempo. */
	bpm?: number;
	/** 1-minute changes: the count, and the goal. */
	changes?: number;
	changesTarget?: number;
};

export type LocalSession = {
	id: string;
	date: string;
	plannedMin: number;
	startedAt: number;
	blocks: PlanBlock[];
	results: (BlockResult | null)[];
	/** The block on screen. */
	idx: number;
	/** play: practising the block · rate: the self-rating step. */
	phase: 'play' | 'rate';
	/** Active time spent on the current block before `since` (ms). */
	accMs: number;
	/** The block clock runs since this instant (ms); null while stopped (paused or hidden). */
	since: number | null;
	/** Paused by the learner (the clock stays stopped until they resume). */
	paused: boolean;
	/** "+1 min" taps on the current block. */
	extraMin: number;
	/** The current block's time-up chime has sounded. */
	timeUp: boolean;
	/** Last moment the clock was seen running (ms): a reload never counts the time away. */
	lastActiveAt: number;
	notes: (BlockNote | null)[];
	endedAt: number | null;
	summary: SessionSummary | null;
};

function read<T>(key: string): T | null {
	try {
		return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
	} catch {
		return null;
	}
}
function write(key: string, value: unknown) {
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// storage full or blocked: the server copy still lets the session resume
	}
}

export const SESSION_STORAGE_KEY = SESSION_KEY;
export const loadLocal = () => read<LocalSession>(SESSION_KEY);
export const saveLocal = (s: LocalSession | null) => write(SESSION_KEY, s);

// ---- the block clock (pure on a session object; the callers save it) ----------------------------

/** Extra time a block may count past its planned length (+1 min taps included). */
export const GRACE_MS = 30_000;
/** A session untouched this long is over: it is ended at its last activity. */
export const STALE_MS = 3 * 3600_000;

/** Active time on the current block. */
export const elapsedMs = (s: LocalSession, now: number) =>
	Math.max(0, s.accMs + (s.since !== null ? Math.max(0, now - s.since) : 0));

/** Planned time of the current block, with its +1 min extensions. */
export const blockLimitMs = (s: LocalSession) =>
	((s.blocks[s.idx]?.minutes ?? 0) + s.extraMin) * 60_000;

/** The time a block result stores: active time, capped at the plan + extensions + grace. */
export const countedSec = (s: LocalSession, now: number) =>
	Math.round(Math.min(elapsedMs(s, now), blockLimitMs(s) + GRACE_MS) / 1000);

/** Stops the clock (hidden page, leaving the runner, pausing). */
export function stopClock(s: LocalSession, now: number) {
	if (s.since !== null) {
		s.accMs += Math.max(0, now - s.since);
		s.since = null;
	}
	s.lastActiveAt = now;
}

/** Starts the clock where it may run: playing, not paused, not ended. */
export function startClock(s: LocalSession, now: number) {
	if (s.since === null && !s.paused && s.phase === 'play' && !s.endedAt && s.idx < s.blocks.length)
		s.since = now;
	s.lastActiveAt = now;
}

/** While visible and running: remember that the learner is still here. */
export function heartbeat(s: LocalSession, now: number) {
	if (s.since !== null) s.lastActiveAt = now;
}

/**
 * A session read back from storage: a clock left running (closed tab, crash) only counts up to
 * the last heartbeat, never the time away.
 */
export function recoverClock(s: LocalSession) {
	if (s.since !== null) {
		s.accMs += Math.max(0, (s.lastActiveAt ?? s.since) - s.since);
		s.since = null;
	}
}

export const isStale = (s: LocalSession, now: number) =>
	!s.endedAt && now - (s.lastActiveAt ?? s.startedAt) > STALE_MS;

/** A new local session for a plan (the clock starts when the runner shows the first block). */
export function newSession(plan: Plan, date: string, now = Date.now()): LocalSession {
	return {
		id: uuid(),
		date,
		plannedMin: plan.minutes,
		startedAt: now,
		blocks: plan.blocks,
		results: plan.blocks.map(() => null),
		idx: 0,
		phase: 'play',
		accMs: 0,
		since: null,
		paused: false,
		extraMin: 0,
		timeUp: false,
		lastActiveAt: now,
		notes: plan.blocks.map(() => null),
		endedAt: null,
		summary: null
	};
}

/** Older stored sessions (before the clock fields) get their defaults. */
function upgrade(s: LocalSession): LocalSession {
	return {
		...s,
		paused: s.paused ?? false,
		timeUp: s.timeUp ?? false,
		lastActiveAt: s.lastActiveAt ?? s.since ?? s.startedAt,
		notes: s.notes ?? s.blocks.map(() => null)
	};
}

/**
 * The session in progress (not ended), whatever day it started. A stale one is ended at its
 * last activity (the end is sent to the server) and null is returned.
 */
export function activeSession(now = Date.now()): LocalSession | null {
	const raw = loadLocal();
	if (!raw || raw.endedAt) return null;
	const s = upgrade(raw);
	if (isStale(s, now)) {
		recoverClock(s);
		s.endedAt = s.lastActiveAt;
		saveLocal(s);
		void api.end(s.id, s.endedAt);
		return null;
	}
	return s;
}

/** The stored local session (ended or not), with defaults filled in. */
export function storedSession(): LocalSession | null {
	const s = loadLocal();
	return s ? upgrade(s) : null;
}

/** A session from the server as local state, resuming at its first unfinished block. */
export function fromStored(s: StoredSession): LocalSession {
	const idx = s.results.findIndex((r) => r === null);
	return {
		...newSession({ date: s.date, minutes: s.plannedMin, blocks: s.blocks, due: 0 }, s.date),
		id: s.id,
		startedAt: s.startedAt,
		results: s.results,
		idx: idx < 0 ? s.blocks.length : idx,
		endedAt: s.endedAt
	};
}

// ---- inferred rating ------------------------------------------------------------------------------

/**
 * A rating suggested by what the block measured: the ladder moved up or was mastered → 😎; it
 * stepped down or the last two passes missed → 😖; a changes count against its goal. Null when
 * nothing was measured.
 */
export function inferRating(note: BlockNote | null | undefined): Rating | null {
	if (!note) return null;
	if (note.changes !== undefined && note.changesTarget) {
		if (note.changes >= note.changesTarget) return 'great';
		return note.changes >= note.changesTarget * 0.5 ? 'ok' : 'hard';
	}
	const ev = note.ladder ?? [];
	if (!ev.length) return null;
	if (ev.includes('mastered') || ev.includes('up')) return 'great';
	const passes = ev.filter((e) => e !== 'up' && e !== 'down' && e !== 'mastered');
	const lastTwo = passes.slice(-2);
	if (ev.includes('down') || (lastTwo.length === 2 && lastTwo.every((e) => e === 'miss')))
		return 'hard';
	return 'ok';
}

// ---- plans and lengths -----------------------------------------------------------------------------

export const getLength = () => read<number>(LENGTH_KEY);
export const setLength = (m: number) => write(LENGTH_KEY, m);

/** The last plan fetched per length (shown offline). */
export const cachePlan = (p: Plan) => write(`${PLAN_KEY}:${p.minutes}`, p);
export const cachedPlan = (minutes: number) => read<Plan>(`${PLAN_KEY}:${minutes}`);

/**
 * Offline fallback: the same planner on what the browser has cached (the curriculum, the song
 * list and the next lesson from the last plan). No reviews or weak spots: those need the server.
 */
export function fallbackPlan(
	index: LearnIndex,
	songs: SongSummary[],
	minutes: number,
	date: string,
	next: string | null
): Plan {
	return planSession({
		minutes,
		date,
		now: Date.now(),
		dueBy: Date.now(),
		index,
		lessonStates: {},
		next: next ?? index.lessons[0]?.id ?? null,
		skills: [],
		exercises: {},
		pairs: [],
		songs: songs.map((s) => ({
			id: s.id,
			title: s.title,
			level: s.level,
			bars: s.bars,
			pickup: s.pickup,
			play: s.play,
			lastPlayedAt: null,
			maxTempoPct: null,
			loop: null
		})),
		recent: []
	});
}

/** RFC 4122 v4 id; crypto.randomUUID needs a secure context (LAN over http has none). */
export function uuid(): string {
	if (typeof crypto.randomUUID === 'function' && globalThis.isSecureContext !== false)
		return crypto.randomUUID();
	const b = crypto.getRandomValues(new Uint8Array(16));
	b[6] = (b[6] & 0x0f) | 0x40;
	b[8] = (b[8] & 0x3f) | 0x80;
	const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---- outbox ----------------------------------------------------------------------------------------
// Session writes are idempotent on the server, so sending one twice is safe; losing one is not.
// An item leaves the queue only once the server answered it (2xx, or a 4xx a retry cannot fix);
// network errors and 5xx keep it, with backoff. Items carry ids and are removed by id, so two tabs
// draining at once never drop each other's items (Web Locks serialise them where available).

// The demo answers in the page itself (no network): a failure there is deterministic, so a retry
// would fail the same way and block the queue. It is dropped (and reported) instead.

type Pending = { id: string; url: string; method: string; body: unknown };

const FAILS_FOR_GOOD = __DEMO__;
/** Event on window when a write is dropped; the demo banner shows it. */
export const WRITE_FAILED_EVENT = 'sg:write-failed';

function writeFailed(method: string, url: string) {
	console.error(`${method} ${url} failed; not retried`);
	dispatchEvent(new CustomEvent(WRITE_FAILED_EVENT, { detail: 'A change could not be saved.' }));
}

export const MAX_OUTBOX = 200;
const MAX_BACKOFF_MS = 60_000;

const queue = () => read<Pending[]>(OUTBOX_KEY) ?? [];
export const pendingWrites = () => queue().length;

function enqueue(url: string, method: string, body: unknown) {
	// Over the cap, the oldest go first (a sane queue never gets near it).
	write(OUTBOX_KEY, [...queue(), { id: uuid(), url, method, body }].slice(-MAX_OUTBOX));
}

let flushing: Promise<void> | null = null;
let failures = 0;
let retryAt = 0;

/** Sends queued writes in order; stops at the first network/server failure (kept, backoff). */
export function flushOutbox(opts: { force?: boolean } = {}): Promise<void> {
	if (opts.force) retryAt = 0;
	if (!flushing) {
		flushing = withLock(drain);
		// Cleared once done (never synchronously inside drain: an empty queue resolves at once).
		void flushing.finally(() => (flushing = null));
	}
	return flushing;
}

function withLock(fn: () => Promise<void>): Promise<void> {
	const locks = (globalThis.navigator as Navigator | undefined)?.locks;
	return locks?.request ? locks.request('sg:outbox', () => fn()).then(() => {}) : fn();
}

const send = (item: { url: string; method: string; body: unknown }) =>
	sendJson(item.url, item.method, item.body);

async function drain() {
	while (Date.now() >= retryAt) {
		const [item] = queue();
		if (!item) return;
		let status = 0;
		try {
			status = (await send(item)).status;
		} catch {
			// offline
		}
		if (FAILS_FOR_GOOD && (status === 0 || status >= 500)) {
			writeFailed(item.method, item.url);
		} else if (status === 0 || status >= 500) {
			failures++;
			retryAt = Date.now() + Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (failures - 1));
			return;
		}
		failures = 0;
		retryAt = 0;
		// Answered (2xx, or a 4xx a retry would not fix; any failure in the demo): drop this item.
		write(
			OUTBOX_KEY,
			queue().filter((x) => x.id !== item.id)
		);
	}
}

let syncing = false;
/** Keeps flushing while anything is queued: when back online, visible again, and every 15 s. */
export function startOutboxSync(): () => void {
	if (syncing) return () => {};
	syncing = true;
	const tick = () => {
		if (pendingWrites()) void flushOutbox();
	};
	const online = () => void flushOutbox({ force: true });
	const visible = () => document.visibilityState === 'visible' && tick();
	addEventListener('online', online);
	document.addEventListener('visibilitychange', visible);
	const timer = setInterval(tick, 15_000);
	tick();
	return () => {
		syncing = false;
		removeEventListener('online', online);
		document.removeEventListener('visibilitychange', visible);
		clearInterval(timer);
	};
}

export type WriteResult<T> =
	| { status: 'sent'; data: T }
	| { status: 'queued' }
	| { status: 'rejected'; code: number; message: string };

/**
 * A session write: sent now when online (and nothing is queued before it), else queued for
 * `flushOutbox`. A 4xx is 'rejected' (with the server's message); it is never queued.
 */
export async function sendWrite<T>(
	url: string,
	method: string,
	body: unknown
): Promise<WriteResult<T>> {
	if (flushing) await flushing;
	if (queue().length) {
		enqueue(url, method, body);
		void flushOutbox();
		return { status: 'queued' };
	}
	try {
		const res = await send({ url, method, body });
		if (res.ok) return { status: 'sent', data: (await res.json()) as T };
		if (res.status >= 500 && FAILS_FOR_GOOD) writeFailed(method, url);
		if (res.status < 500 || FAILS_FOR_GOOD) {
			const message = await res
				.json()
				.then((j: { message?: string }) => j.message ?? '')
				.catch(() => '');
			return { status: 'rejected', code: res.status, message };
		}
	} catch (e) {
		// offline: queued below
		if (FAILS_FOR_GOOD) {
			writeFailed(method, url);
			return { status: 'rejected', code: 500, message: String(e) };
		}
	}
	enqueue(url, method, body);
	return { status: 'queued' };
}

const data = <T>(r: WriteResult<T>) => (r.status === 'sent' ? r.data : null);

/** Session writes (all idempotent on the server, so retries are safe). */
export const api = {
	start: (s: LocalSession, minutes: number) =>
		sendWrite<StoredSession>('/api/session', 'POST', {
			id: s.id,
			date: s.date,
			tz: clientTz(),
			minutes,
			blocks: s.blocks,
			startedAt: s.startedAt
		}),
	block: (id: string, idx: number, r: BlockResult) =>
		sendWrite<StoredSession>(`/api/session/${id}/blocks/${idx}`, 'PUT', { ...r, tz: clientTz() }),
	end: async (id: string, endedAt: number) =>
		data(
			await sendWrite<SessionSummary>(`/api/session/${id}/end`, 'POST', { endedAt, tz: clientTz() })
		)
};

export function planUrl(minutes: number, date: string) {
	return `/api/session/plan?minutes=${minutes}&date=${date}&tz=${encodeURIComponent(String(clientTz()))}`;
}
