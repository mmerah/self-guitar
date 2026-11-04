// The app's update state (shown by UpdateBar and the version line) and its service worker wiring.
import type { RegisterSWOptions } from 'virtual:pwa-register';
import { canAutoApply, createUpdateChecker, watchUpdateTriggers } from './update';

export const pwaUpdate = $state({
	/** A new version is installed and waiting. */
	needRefresh: false,
	/** The learner closed the bar (the version line still says so). */
	dismissed: false,
	/** Reloading into the new version. */
	applying: false
});

type RegisterSW = (options: RegisterSWOptions) => (reloadPage?: boolean) => Promise<void>;

let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

/** Activates the waiting version; the page reloads once it controls it. */
export async function applyUpdate() {
	if (!updateSW || pwaUpdate.applying) return;
	pwaUpdate.applying = true;
	// The plugin reloads only if a worker controlled the page when it registered; a page first
	// controlled through clientsClaim (the visit that installed the app) needs this.
	navigator.serviceWorker?.addEventListener('controllerchange', () => location.reload(), {
		once: true
	});
	await updateSW(true);
}

/**
 * Registers the service worker (prompt mode): checks for a new version when the app is shown
 * again, back online and hourly while visible; a waiting version is applied at once on an idle
 * screen (see canAutoApply), else announced by the bar.
 */
export function startPwaUpdates(
	registerSW: RegisterSW,
	idle: () => { path: string; playing: boolean; inSession: boolean }
) {
	let stop: (() => void) | null = null;
	updateSW = registerSW({
		immediate: true,
		onNeedRefresh() {
			pwaUpdate.needRefresh = true;
			maybeAutoApply(idle);
		},
		onRegisteredSW(_url, registration) {
			if (!registration) return;
			const checker = createUpdateChecker({ update: () => registration.update() });
			stop = watchUpdateTriggers(() => checker.check());
		}
	});
	return () => stop?.();
}

/** Applies a waiting update if the app is idle (called when it is found and on navigation). */
export function maybeAutoApply(idle: () => { path: string; playing: boolean; inSession: boolean }) {
	if (!pwaUpdate.needRefresh || pwaUpdate.applying) return;
	const s = idle();
	if (canAutoApply(s.path, s)) void applyUpdate();
}
