// Storage room for takes: checked before recording, and a full disk is told plainly.

/** Below this much free room a new take is not started (about 15 minutes of Opus). */
export const MIN_FREE_BYTES = 8 * 1024 * 1024;
/** Below this much, recording still starts but the reader is warned. */
export const LOW_FREE_BYTES = 50 * 1024 * 1024;

export type QuotaState = {
	usage: number;
	quota: number;
	free: number;
	level: 'ok' | 'low' | 'full';
};

export function quotaState(estimate: { usage?: number; quota?: number } | null): QuotaState | null {
	if (!estimate || !estimate.quota) return null;
	const usage = estimate.usage ?? 0;
	const free = Math.max(0, estimate.quota - usage);
	return {
		usage,
		quota: estimate.quota,
		free,
		level: free < MIN_FREE_BYTES ? 'full' : free < LOW_FREE_BYTES ? 'low' : 'ok'
	};
}

export async function checkQuota(): Promise<QuotaState | null> {
	try {
		const est = await navigator.storage?.estimate?.();
		return quotaState(est ?? null);
	} catch {
		return null;
	}
}

/** Asks the browser to keep this site's storage (best effort: some browsers ask the user). */
export async function persistStorage() {
	try {
		if (navigator.storage?.persisted && !(await navigator.storage.persisted()))
			await navigator.storage.persist?.();
	} catch {
		// not supported
	}
}

/** A write failed because the storage is full (names differ between browsers). */
export function isQuotaError(e: unknown): boolean {
	const err = e as { name?: string; code?: number; message?: string } | null;
	if (!err) return false;
	if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
	if (err.code === 22 || err.code === 1014) return true;
	return /quota|disk is full|storage.*full/i.test(err.message ?? '');
}

/** Storage was already full before a take started: nothing was recorded. */
export const NO_ROOM = {
	title: 'Not enough storage to record — free some space',
	body: 'Delete old takes in My recordings (or other site data), then try again.'
};

/** Storage filled up during a take: what was recorded so far is kept. */
export const STORAGE_FULL =
	'Storage is full: the take was saved up to this point. Delete old takes in My recordings to make room.';

export function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
	if (n < 1024 * 1024 * 1024)
		return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
	return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function formatDuration(s: number): string {
	const t = Math.max(0, Math.floor(s));
	return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
