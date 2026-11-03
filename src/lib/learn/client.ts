// Browser-side loaders and writes for the curriculum (no state library: pages hold what they load).
import { clientTz } from '$lib/session/time';
import { getJson, getOptional, sendJson } from '$lib/api';
import type { ExerciseDetail, LearnIndex, LearnProgress } from './types';

type Fetch = typeof fetch;

export const EMPTY_PROGRESS: LearnProgress = {
	lessons: {},
	skills: {},
	exercises: {},
	masteredLevels: [],
	next: null
};

/** The curriculum (precached by the service worker, so it loads offline). */
export const loadLearnIndex = (fetch: Fetch) => getJson<LearnIndex>(fetch, '/api/learn');
export const loadLearnProgress = (fetch: Fetch) =>
	getOptional<LearnProgress>(fetch, '/api/learn/progress', EMPTY_PROGRESS);
/** One exercise's stats and ladder position; null when unreachable (offline, first visit). */
export const loadExercise = (fetch: Fetch, id: string) =>
	getOptional<ExerciseDetail | null>(fetch, `/api/exercises/${encodeURIComponent(id)}`, null);

export const OFFLINE_MESSAGE = 'You’re offline — not saved';

/** A failed write as a short message for the UI (offline is told apart from server errors). */
export function saveErrorMessage(e: unknown): string {
	const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
	if (offline || e instanceof TypeError)
		return offline ? OFFLINE_MESSAGE : 'Server unreachable — not saved';
	return (e as Error).message || 'Not saved';
}

async function send<T>(url: string, method: string, body: unknown): Promise<T> {
	let res: Response;
	try {
		res = await sendJson(url, method, body);
	} catch (e) {
		// fetch rejects with a TypeError when the network is down.
		throw new Error(saveErrorMessage(e));
	}
	if (!res.ok) throw new Error(`Not saved (server error ${res.status})`);
	return (await res.json()) as T;
}

export const setLessonStatus = (id: string, status: 'started' | 'completed') =>
	send<LearnProgress>(`/api/learn/lessons/${encodeURIComponent(id)}`, 'PUT', { status });

export const confirmMastery = (id: string, checked?: number[]) =>
	send<LearnProgress>(
		`/api/learn/lessons/${encodeURIComponent(id)}/mastery`,
		'POST',
		checked ? { checked } : {}
	);

export const recordAttempt = (id: string, bpm: number, clean: boolean) =>
	send<ExerciseDetail>(`/api/exercises/${encodeURIComponent(id)}/attempts`, 'POST', {
		bpm,
		clean,
		tz: clientTz()
	});
