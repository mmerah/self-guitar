// Browser-side loaders and writes for the curriculum (no state library: pages hold what they load).
import { clientTz } from '$lib/session/time';
import { getJson, getOptional, sendJson } from '$lib/api';
import type { Exercise, ExerciseDetail, LearnIndex, LearnProgress, LessonPayload } from './types';

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
/** A lesson's body and its exercises' scores (cached by the service worker once opened). */
export const loadLesson = (fetch: Fetch, id: string) =>
	getJson<LessonPayload>(fetch, `/api/learn/lessons/${encodeURIComponent(id)}`);
/** An exercise with its score; null when unreachable (offline before it was ever opened). */
export const loadExerciseContent = (fetch: Fetch, id: string) =>
	getOptional<Exercise | null>(fetch, `/api/learn/exercises/${encodeURIComponent(id)}`, null);

const lessonMemo = new Map<string, Promise<LessonPayload | null>>();
const exerciseMemo = new Map<string, Promise<Exercise | null>>();
function memo<T>(m: Map<string, Promise<T | null>>, id: string, load: () => Promise<T | null>) {
	let p = m.get(id);
	if (!p) {
		p = load().then((v) => (v === null && m.delete(id), v));
		m.set(id, p);
	}
	return p;
}
/** A lesson's payload for widgets (session blocks): loaded once per page, null when unreachable. */
export const lessonContent = (id: string) =>
	memo(lessonMemo, id, () =>
		getOptional<LessonPayload | null>(
			fetch,
			`/api/learn/lessons/${encodeURIComponent(id)}`,
			null
		).then((p) => {
			for (const e of p?.exercises ?? [])
				if (!exerciseMemo.has(e.id)) exerciseMemo.set(e.id, Promise.resolve(e));
			return p;
		})
	);
/** An exercise with its score for widgets: loaded once per page, null when unreachable. */
export const exerciseContent = (id: string) =>
	memo(exerciseMemo, id, () => loadExerciseContent(fetch, id));
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

/** One rated ladder pass; `heard` is the mic check's accuracy when the mic judged it. */
export const recordAttempt = (
	id: string,
	bpm: number,
	clean: boolean,
	heard?: { hits: number; total: number }
) =>
	send<ExerciseDetail>(`/api/exercises/${encodeURIComponent(id)}/attempts`, 'POST', {
		bpm,
		clean,
		tz: clientTz(),
		...(heard && { hits: heard.hits, total: heard.total })
	});
