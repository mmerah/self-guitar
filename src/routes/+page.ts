import { getOptional, loadAllProgress } from '$lib/api';
import { loadLearnProgress } from '$lib/learn/client';
import type { Goals } from '$lib/session/goals';
import { getLength } from '$lib/session/client';
import { loadPlan } from '$lib/session/today';
import { localDate, type Settings, type StoredSession } from '$lib/session/types';

// Prerendered as the offline app shell; data loads in the browser (ssr is off).
export const prerender = true;

/** First session: a gentle 10 minutes. */
const FIRST_SESSION_MIN = 10;

/** Today: the plan for the chosen length, the weekly goal, today's session, continue links. */
export async function load({ fetch }) {
	const date = localDate();
	const [progress, learn, goals, todaySession] = await Promise.all([
		loadAllProgress(fetch),
		loadLearnProgress(fetch),
		getOptional<(Goals & { settings: Settings; firstDate: string | null }) | null>(
			fetch,
			`/api/goals?date=${date}`,
			null
		),
		getOptional<StoredSession | null>(fetch, `/api/session/today?date=${date}`, null)
	]);
	const firstTime = goals?.firstDate === null;
	const minutes =
		getLength() ?? (firstTime ? FIRST_SESSION_MIN : (goals?.settings.sessionMin ?? 15));
	const { plan, source } = await loadPlan(fetch, minutes, learn.next?.id ?? null);
	// The progress list carries each song's title: no song list to fetch for one name.
	const recent = progress.find((p) => p.lastPlayedAt && p.title);
	return {
		date,
		minutes,
		plan,
		source,
		goals,
		firstTime,
		todaySession,
		continue: recent ? { ...recent, title: recent.title!, pickup: !!recent.pickup } : null,
		nextLesson: learn.next,
		lessonStarted: learn.next ? learn.lessons[learn.next.id]?.state === 'started' : false
	};
}
