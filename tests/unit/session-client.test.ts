// The browser side of a session: the outbox (5xx, network errors, two tabs, cap) and the block
// clock (only active time counts, capped at the plan). localStorage and fetch are stubbed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalSession } from '../../src/lib/session/client';

class MemoryStorage {
	map = new Map<string, string>();
	getItem = (k: string) => this.map.get(k) ?? null;
	setItem = (k: string, v: string) => void this.map.set(k, String(v));
	removeItem = (k: string) => void this.map.delete(k);
}

/** A fresh copy of the module: one per "tab" (they share localStorage, like real tabs). */
const tab = async () => {
	vi.resetModules();
	return import('../../src/lib/session/client');
};

const outbox = () =>
	JSON.parse(localStorage.getItem('sg:outbox') ?? '[]') as { id: string; url: string }[];

beforeEach(() => {
	vi.stubGlobal('localStorage', new MemoryStorage());
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

const respond = (status: number, body: unknown = {}) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('outbox', () => {
	it('queues on a network error and on 5xx; drops only on 2xx/4xx; backs off', async () => {
		const c = await tab();
		const fetch = vi.fn().mockRejectedValueOnce(new TypeError('offline'));
		vi.stubGlobal('fetch', fetch);
		expect(await c.sendWrite('/api/a', 'PUT', { n: 1 })).toEqual({ status: 'queued' });
		fetch.mockResolvedValueOnce(respond(503));
		expect(await c.sendWrite('/api/b', 'PUT', { n: 2 })).toEqual({ status: 'queued' });
		expect(outbox().map((x) => x.url)).toEqual(['/api/a', '/api/b']);

		// A 5xx keeps the item and backs off: an immediate flush sends nothing.
		await c.flushOutbox({ force: true }); // (the queued b-write already tried once)
		fetch.mockReset();
		fetch.mockResolvedValue(respond(502));
		await c.flushOutbox({ force: true });
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(outbox()).toHaveLength(2);
		await c.flushOutbox();
		expect(fetch).toHaveBeenCalledTimes(1); // backing off

		// Back: a 2xx and a 4xx both leave the queue.
		fetch.mockReset();
		fetch.mockResolvedValueOnce(respond(200)).mockResolvedValueOnce(respond(400));
		await c.flushOutbox({ force: true });
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(outbox()).toEqual([]);
	});

	it('a 4xx on a direct write is rejected with the message, never queued', async () => {
		const c = await tab();
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(400, { message: 'bad date' })));
		expect(await c.sendWrite('/api/session', 'POST', {})).toEqual({
			status: 'rejected',
			code: 400,
			message: 'bad date'
		});
		expect(outbox()).toEqual([]);
	});

	it('two tabs draining at once deliver every item and never drop an unsent one', async () => {
		localStorage.setItem(
			'sg:outbox',
			JSON.stringify([
				{ id: 'a', url: '/api/a', method: 'PUT', body: {} },
				{ id: 'b', url: '/api/b', method: 'PUT', body: {} },
				{ id: 'c', url: '/api/c', method: 'PUT', body: {} }
			])
		);
		const sent: string[] = [];
		// Slow answers: both tabs read the same head before either removes it.
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				sent.push(url);
				await new Promise((r) => setTimeout(r, 5));
				return respond(200);
			})
		);
		const one = await tab();
		const two = await tab();
		await Promise.all([one.flushOutbox(), two.flushOutbox()]);
		expect(outbox()).toEqual([]);
		expect(new Set(sent)).toEqual(new Set(['/api/a', '/api/b', '/api/c']));
	});

	it('keeps at most MAX_OUTBOX items (the oldest go)', async () => {
		const c = await tab();
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
		for (let i = 0; i < c.MAX_OUTBOX + 5; i++) await c.sendWrite(`/api/${i}`, 'PUT', {});
		const q = outbox();
		expect(q).toHaveLength(c.MAX_OUTBOX);
		expect(q[q.length - 1].url).toBe(`/api/${c.MAX_OUTBOX + 4}`);
		expect(new Set(q.map((x) => x.id)).size).toBe(c.MAX_OUTBOX);
	});
});

describe('block clock', () => {
	const plan = {
		date: '2026-11-03',
		minutes: 5,
		due: 0,
		blocks: [
			{
				kind: 'warmup' as const,
				title: 'Tune up',
				minutes: 2,
				why: 'Every session starts in tune',
				target: { type: 'tool' as const, id: 'tuner' as const, params: {} }
			}
		]
	};
	let s: LocalSession;
	let c: Awaited<ReturnType<typeof tab>>;
	beforeEach(async () => {
		c = await tab();
		s = c.newSession(plan, plan.date, 0);
	});

	it('counts only time while running: hidden or paused time is not counted', () => {
		c.startClock(s, 1_000);
		expect(c.elapsedMs(s, 31_000)).toBe(30_000);
		c.stopClock(s, 31_000); // page hidden
		expect(c.elapsedMs(s, 600_000)).toBe(30_000);
		c.startClock(s, 600_000); // visible again
		expect(c.elapsedMs(s, 610_000)).toBe(40_000);
		s.paused = true;
		c.stopClock(s, 610_000);
		c.startClock(s, 700_000); // a paused clock stays stopped
		expect(c.elapsedMs(s, 800_000)).toBe(40_000);
	});

	it('a reload never counts the time away (only up to the last heartbeat)', () => {
		c.startClock(s, 0);
		c.heartbeat(s, 50_000);
		const reloaded = JSON.parse(JSON.stringify(s)) as LocalSession;
		c.recoverClock(reloaded); // the tab was closed for an hour
		expect(c.elapsedMs(reloaded, 3_650_000)).toBe(50_000);
	});

	it('the saved time is capped at the plan + extensions + grace', () => {
		c.startClock(s, 0);
		expect(c.countedSec(s, 10 * 60_000)).toBe(2 * 60 + 30);
		s.extraMin = 1;
		expect(c.countedSec(s, 10 * 60_000)).toBe(3 * 60 + 30);
		expect(c.countedSec(s, 90_000)).toBe(90);
	});

	it('a stale session is ended at its last activity; one across midnight is not', () => {
		const t0 = Date.UTC(2026, 10, 3, 23, 50);
		const fresh = c.newSession(plan, '2026-11-03', t0);
		c.startClock(fresh, t0);
		c.heartbeat(fresh, t0 + 5 * 60_000);
		c.saveLocal(fresh);
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(200, {})));
		// 00:05 the next day: still the same session, resumable.
		expect(c.activeSession(t0 + 15 * 60_000)?.id).toBe(fresh.id);
		// Four hours later: over, ended at its last activity.
		expect(c.activeSession(t0 + 4 * 3600_000)).toBeNull();
		const ended = c.loadLocal()!;
		expect(ended.endedAt).toBe(t0 + 5 * 60_000);
		expect(c.elapsedMs(ended, t0 + 4 * 3600_000)).toBe(5 * 60_000);
	});
});

describe('inferred rating', () => {
	it('reads the ladder and the changes count', async () => {
		const c = await tab();
		expect(c.inferRating(null)).toBeNull();
		expect(c.inferRating({ ladder: ['clean', 'clean', 'clean', 'up'] })).toBe('great');
		expect(c.inferRating({ ladder: ['clean', 'miss', 'clean'] })).toBe('ok');
		expect(c.inferRating({ ladder: ['clean', 'miss', 'miss'] })).toBe('hard');
		expect(c.inferRating({ ladder: ['miss', 'miss', 'down'] })).toBe('hard');
		expect(c.inferRating({ ladder: ['clean', 'mastered'] })).toBe('great');
		expect(c.inferRating({ changes: 31, changesTarget: 30 })).toBe('great');
		expect(c.inferRating({ changes: 18, changesTarget: 30 })).toBe('ok');
		expect(c.inferRating({ changes: 9, changesTarget: 30 })).toBe('hard');
	});
});
