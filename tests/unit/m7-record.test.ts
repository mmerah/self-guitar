import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extFor, MIME_PREFERENCE, pickMime } from '../../src/lib/record/mime';
import {
	formatBytes,
	formatDuration,
	isQuotaError,
	LOW_FREE_BYTES,
	MIN_FREE_BYTES,
	quotaState
} from '../../src/lib/record/quota';
import {
	appendChunk,
	attachmentFor,
	attachTake,
	closeDb,
	createTake,
	deleteAllTakes,
	deleteTake,
	finishTake,
	getTake,
	groupTakes,
	listTakes,
	markLive,
	onTakesChanged,
	STALE_MS,
	takeBlob,
	takesFor,
	totalSize,
	updateTake
} from '../../src/lib/record/store';
import type { TakeInput } from '../../src/lib/record/types';
import { downsample, mono, normaliser } from '../../src/lib/record/waveform';

const input = (over: Partial<TakeInput> = {}): TakeInput => ({
	itemType: 'exercise',
	itemId: 'ex-1',
	title: 'Exercise one',
	tempoPct: 80,
	bpm: 72,
	mime: 'audio/webm;codecs=opus',
	mode: 'along',
	offsetMs: 120,
	countIn: true,
	...over
});
const bytes = (...v: number[]) => new Uint8Array(v).buffer;

beforeEach(async () => {
	await closeDb();
	globalThis.indexedDB = new IDBFactory();
});
afterEach(closeDb);

describe('mime selection', () => {
	it('prefers Opus in WebM, then MP4 (Safari), then the rest', () => {
		expect(pickMime(() => true)).toBe('audio/webm;codecs=opus');
		const safari = new Set(['audio/mp4', 'audio/mp4;codecs=mp4a.40.2']);
		expect(pickMime((t) => safari.has(t))).toBe('audio/mp4;codecs=mp4a.40.2');
		expect(pickMime((t) => t === 'audio/mp4')).toBe('audio/mp4');
		expect(pickMime((t) => t === 'audio/ogg;codecs=opus')).toBe('audio/ogg;codecs=opus');
		expect(pickMime(() => false)).toBe('');
		expect(MIME_PREFERENCE[0]).toBe('audio/webm;codecs=opus');
	});
	it('survives a throwing isTypeSupported', () => {
		expect(
			pickMime((t) => {
				if (t.includes('webm')) throw new Error('odd');
				return t === 'audio/mp4';
			})
		).toBe('audio/mp4');
	});
	it('names download extensions', () => {
		expect(extFor('audio/webm;codecs=opus')).toBe('webm');
		expect(extFor('audio/mp4')).toBe('m4a');
		expect(extFor('audio/ogg; codecs=opus')).toBe('ogg');
		expect(extFor('')).toBe('audio');
	});
});

describe('quota', () => {
	it('classifies free room', () => {
		expect(quotaState(null)).toBeNull();
		expect(quotaState({ usage: 0, quota: 0 })).toBeNull();
		expect(quotaState({ usage: 0, quota: 1e9 })?.level).toBe('ok');
		expect(quotaState({ usage: 1e9 - LOW_FREE_BYTES + 1, quota: 1e9 })?.level).toBe('low');
		const full = quotaState({ usage: 1e9 - MIN_FREE_BYTES + 1, quota: 1e9 });
		expect(full?.level).toBe('full');
		expect(full?.free).toBe(MIN_FREE_BYTES - 1);
	});
	it('recognises storage-full errors across browsers', () => {
		expect(isQuotaError(new DOMException('x', 'QuotaExceededError'))).toBe(true);
		expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
		expect(isQuotaError({ code: 22 })).toBe(true);
		expect(isQuotaError(new Error('The quota has been exceeded.'))).toBe(true);
		expect(isQuotaError(new Error('network'))).toBe(false);
		expect(isQuotaError(null)).toBe(false);
	});
	it('formats sizes and durations', () => {
		expect(formatBytes(500)).toBe('500 B');
		expect(formatBytes(2048)).toBe('2 KB');
		expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
		expect(formatBytes(50 * 1024 * 1024)).toBe('50 MB');
		expect(formatDuration(0)).toBe('0:00');
		expect(formatDuration(65.9)).toBe('1:05');
	});
});

describe('waveform', () => {
	it('downsamples to min/max per bucket', () => {
		const s = new Float32Array([0, 0.5, -0.5, 1, -1, 0.25, 0, 0]);
		const p = downsample(s, 4);
		expect([...p.max]).toEqual([0.5, 1, 0.25, 0]);
		expect([...p.min]).toEqual([0, -0.5, -1, 0]);
	});
	it('handles more buckets than samples and empty input', () => {
		const p = downsample(new Float32Array([0.5, -0.5]), 4);
		expect(p.max.length).toBe(4);
		expect(Math.max(...p.max)).toBe(0.5);
		expect([...downsample(new Float32Array(0), 3).max]).toEqual([0, 0, 0]);
	});
	it('mixes channels and normalises quiet takes (at most 4x)', () => {
		const a = new Float32Array([1, 0]);
		const b = new Float32Array([0, 1]);
		const m = mono({ numberOfChannels: 2, length: 2, getChannelData: (c) => (c ? b : a) });
		expect([...m]).toEqual([0.5, 0.5]);
		expect(normaliser(downsample(new Float32Array([0.5, -0.5]), 2))).toBe(2);
		expect(normaliser(downsample(new Float32Array([0.01]), 1))).toBe(4);
		expect(normaliser(downsample(new Float32Array([0]), 1))).toBe(1);
	});
});

describe('recordings store', () => {
	it('creates a take with its metadata and appends chunks', async () => {
		let changes = 0;
		const off = onTakesChanged(() => changes++);
		const t = await createTake(input());
		expect(t).toMatchObject({
			itemType: 'exercise',
			itemId: 'ex-1',
			title: 'Exercise one',
			tempoPct: 80,
			bpm: 72,
			mime: 'audio/webm;codecs=opus',
			status: 'recording',
			chunks: 0,
			size: 0,
			duration: 0
		});
		expect(t.id).toBeTruthy();
		expect(t.createdAt).toBeGreaterThan(0);
		await appendChunk(t.id, bytes(1, 2, 3), 2);
		await appendChunk(t.id, bytes(4, 5), 4);
		const done = await finishTake(t.id, 4.5);
		expect(done).toMatchObject({ status: 'done', chunks: 2, size: 5, duration: 4.5 });
		const blob = await takeBlob(t.id);
		expect(blob?.type).toBe('audio/webm;codecs=opus');
		expect([...new Uint8Array(await blob!.arrayBuffer())]).toEqual([1, 2, 3, 4, 5]);
		expect(changes).toBeGreaterThanOrEqual(2);
		off();
	});

	it('drops a take with no audio on finish', async () => {
		const t = await createTake(input());
		expect(await finishTake(t.id)).toBeNull();
		expect(await getTake(t.id)).toBeNull();
	});

	it('lists newest first, groups by item and sums sizes', async () => {
		const a = await createTake(input({ createdAt: 1000 }));
		await appendChunk(a.id, bytes(1), 1);
		await finishTake(a.id);
		const b = await createTake(
			input({ itemType: 'song', itemId: 's', title: 'Song', createdAt: 3000 })
		);
		await appendChunk(b.id, bytes(1, 2), 1);
		await finishTake(b.id);
		const c = await createTake(input({ createdAt: 2000 }));
		await appendChunk(c.id, bytes(1, 2, 3), 1);
		await finishTake(c.id);
		const all = await listTakes();
		expect(all.map((t) => t.id)).toEqual([b.id, c.id, a.id]);
		const groups = groupTakes(all);
		expect(groups.map((g) => g.key)).toEqual(['song:s', 'exercise:ex-1']);
		expect(groups[1].takes.map((t) => t.id)).toEqual([c.id, a.id]);
		expect(totalSize(all)).toBe(6);
		expect((await takesFor('exercise', 'ex-1')).length).toBe(2);
	});

	it('finalises a take left recording by a closed tab, but not a live one', async () => {
		const t = await createTake(input());
		await appendChunk(t.id, bytes(9), 2);
		const live = await createTake(input());
		await appendChunk(live.id, bytes(9), 2);
		markLive(live.id, true);
		const later = Date.now() + STALE_MS + 1000;
		const list = await listTakes(later);
		expect(list.find((x) => x.id === t.id)?.status).toBe('done');
		expect(list.find((x) => x.id === live.id)?.status).toBe('recording');
		// Fresh (still being written by another tab): left alone.
		const fresh = await createTake(input());
		await appendChunk(fresh.id, bytes(9), 2);
		expect((await listTakes()).find((x) => x.id === fresh.id)?.status).toBe('recording');
		markLive(live.id, false);
	});

	it('drops an empty stale take', async () => {
		const t = await createTake(input());
		const list = await listTakes(Date.now() + STALE_MS + 1000);
		expect(list.some((x) => x.id === t.id)).toBe(false);
	});

	it('renames, rates and annotates; empty values clear', async () => {
		const t = await createTake(input());
		await appendChunk(t.id, bytes(1), 1);
		await updateTake(t.id, { name: 'Morning', rating: 3, note: 'cleaner changes' });
		expect(await getTake(t.id)).toMatchObject({
			name: 'Morning',
			rating: 3,
			note: 'cleaner changes'
		});
		const cleared = await updateTake(t.id, { name: '' });
		expect(cleared?.name).toBeUndefined();
	});

	it('deletes one take with its audio and attachment, or all', async () => {
		const a = await createTake(input());
		await appendChunk(a.id, bytes(1), 1);
		const b = await createTake(input());
		await appendChunk(b.id, bytes(1), 1);
		await attachTake('lesson-x', a.id);
		expect(await attachmentFor('lesson-x')).toBe(a.id);
		await deleteTake(a.id);
		expect(await getTake(a.id)).toBeNull();
		expect(await takeBlob(a.id)).toBeNull();
		expect(await attachmentFor('lesson-x')).toBeNull();
		await deleteAllTakes();
		expect(await listTakes()).toEqual([]);
	});

	it('refuses chunks for a deleted take', async () => {
		const t = await createTake(input());
		await deleteTake(t.id);
		await expect(appendChunk(t.id, bytes(1), 1)).rejects.toThrow(/deleted/);
	});
});
