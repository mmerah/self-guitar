// Browser-side loads and writes for the ear trainer (tool page, ::ear widget, session blocks).
import { getOptional, sendJson } from '$lib/api';
import type { EarSummary } from '$lib/core/ear';
import { clientTz } from '$lib/session/time';
import type { EarKind } from './items';
import { notePractised, withLesson } from '$lib/learn/practising';

export const emptyEar = (kind: EarKind): EarSummary => ({ kind, history: [], items: [] });

export const loadEar = (kind: EarKind, f: typeof fetch = fetch) =>
	getOptional<EarSummary>(f, `/api/ear?kind=${kind}`, emptyEar(kind));

/** Saves one answer; null when it could not be saved (offline: the drill goes on). */
export async function saveEarAnswer(
	kind: EarKind,
	item: string,
	answer: string
): Promise<EarSummary | null> {
	try {
		const res = await sendJson(
			'/api/ear',
			'POST',
			withLesson({ kind, item, answer, tz: clientTz() })
		);
		if (!res.ok) return null;
		notePractised();
		return (await res.json()) as EarSummary;
	} catch {
		return null;
	}
}
