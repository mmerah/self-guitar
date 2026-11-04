// The demo's buttons, shared by the banner and the About page.
import { invalidateAll } from '$app/navigation';
import { demoStatus } from './status.svelte';

export const SAMPLE_LOADED = 'Sample loaded: about 2 weeks in, Level 4';

/** Shows a short message at the bottom of the screen. */
export function toast(message: string) {
	demoStatus.toast = message;
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => (demoStatus.toast = ''), 6000);
}
let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** "Load sample progress": returns the message shown (also as a toast). */
export async function loadSample(): Promise<string> {
	let message: string;
	try {
		const { loadSampleProgress } = await import('./actions');
		message = (await loadSampleProgress())
			? SAMPLE_LOADED
			: 'This browser already has progress. Reset the data first to load the sample.';
		await invalidateAll();
	} catch (e) {
		console.error(e);
		message = 'Could not load the sample: nothing was changed.';
	}
	toast(message);
	return message;
}

/** "Reset data…": asks, deletes, reloads. Returns a message when the reset was incomplete. */
export async function resetData(): Promise<string> {
	if (!confirm('Delete all demo progress stored in this browser?')) return '';
	const { resetDemo } = await import('./actions');
	if (await resetDemo()) {
		location.reload();
		return '';
	}
	const message =
		'Settings were cleared, but browser storage is unavailable, so stored progress could not be deleted.';
	toast(message);
	return message;
}
