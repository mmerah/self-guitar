// When to look for a new service worker, and when a waiting one may be applied on its own.

/** Update checks: at most one per `minIntervalMs`. */
export const MIN_CHECK_INTERVAL_MS = 60_000;
/** While the app stays visible, a check every hour. */
export const PERIODIC_CHECK_MS = 60 * 60_000;

export interface UpdateCheckDeps {
	/** registration.update() */
	update: () => Promise<unknown> | void;
	now?: () => number;
	isVisible?: () => boolean;
	minIntervalMs?: number;
}

/**
 * A debounced checker: `check()` calls update() unless one ran less than `minIntervalMs` ago,
 * the page is hidden, or the browser is offline. Returns whether it ran.
 */
export function createUpdateChecker(deps: UpdateCheckDeps) {
	const now = deps.now ?? Date.now;
	const visible = deps.isVisible ?? (() => document.visibilityState === 'visible');
	const min = deps.minIntervalMs ?? MIN_CHECK_INTERVAL_MS;
	let last = -Infinity;
	return {
		check(): boolean {
			if (!visible()) return false;
			if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
			const t = now();
			if (t - last < min) return false;
			last = t;
			try {
				Promise.resolve(deps.update()).catch(() => {});
			} catch {
				// a failed check (offline, server down) waits for the next trigger
			}
			return true;
		}
	};
}

/**
 * Wires the triggers (page visible again, back online, hourly while visible) to `check`.
 * Returns a function that removes them.
 */
export function watchUpdateTriggers(check: () => void, periodMs = PERIODIC_CHECK_MS) {
	const onVisibility = () => {
		if (document.visibilityState === 'visible') check();
	};
	document.addEventListener('visibilitychange', onVisibility);
	addEventListener('online', check);
	const timer = setInterval(() => {
		if (document.visibilityState === 'visible') check();
	}, periodMs);
	return () => {
		document.removeEventListener('visibilitychange', onVisibility);
		removeEventListener('online', check);
		clearInterval(timer);
	};
}

/** The idle screens (Today, Learn, Library) where a waiting update may reload the app on its own. */
const IDLE_PATHS = new Set(['/', '/learn', '/library']);

/**
 * Whether a waiting update can be applied right away: on an idle screen (not opened from a
 * session) with nothing playing. Anywhere else (a session, the player, a tool) the bar waits for
 * the learner's tap.
 */
export function canAutoApply(path: string, opts: { playing: boolean; inSession: boolean }) {
	const p = path.replace(/\/+$/, '') || '/';
	return IDLE_PATHS.has(p) && !opts.playing && !opts.inSession;
}
