// The item a page is about (song, exercise, warm-up): set by the page, read by the players'
// Rec control, so a take knows what it is a recording of.
import { getContext, setContext } from 'svelte';
import type { RecordItem } from './types';

const KEY = Symbol('record-item');

/** Call in a page or wrapper component; a getter keeps it current when the page changes item. */
export function provideRecordItem(get: () => RecordItem | null) {
	setContext(KEY, get);
}

export function recordItemGetter(): () => RecordItem | null {
	return getContext<(() => RecordItem | null) | undefined>(KEY) ?? (() => null);
}

/** Where an item's reference lives (to compare a take with it). */
export function itemHref(
	base: string,
	t: { itemType: string; itemId: string; tempoPct?: number | null },
	takeId?: string
): string | null {
	const q = new URLSearchParams();
	if (takeId) q.set('take', takeId);
	const id = encodeURIComponent(t.itemId);
	switch (t.itemType) {
		case 'song':
			if (t.tempoPct) q.set('tempo', String(Math.round(t.tempoPct)));
			return `${base}/play/${id}?${q}`;
		case 'exercise':
			return `${base}/practice/exercise/${id}?${q}`;
		case 'warmup':
			return `${base}/warmups/${id}`;
		default:
			return null;
	}
}

export const recordingsHref = (base: string, item?: { itemType: string; itemId: string }) =>
	`${base}/recordings${item ? `?item=${encodeURIComponent(`${item.itemType}:${item.itemId}`)}` : ''}`;
