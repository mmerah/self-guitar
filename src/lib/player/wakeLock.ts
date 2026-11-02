// Keeps the screen on while music plays (Screen Wake Lock API; silently unsupported elsewhere).
export function createWakeLock() {
	let sentinel: WakeLockSentinel | null = null;
	let wanted = false;

	async function acquire() {
		if (!wanted || sentinel || !('wakeLock' in navigator) || document.visibilityState !== 'visible')
			return;
		try {
			const lock = await navigator.wakeLock.request('screen');
			// Playback may have stopped (or the player closed) while the request was pending.
			if (!wanted || sentinel) {
				lock.release().catch(() => {});
				return;
			}
			sentinel = lock;
			lock.addEventListener('release', () => {
				if (sentinel === lock) sentinel = null;
			});
		} catch {
			// denied (battery saver, not visible...) - nothing to do
		}
	}

	// The browser releases the lock when the tab is hidden; take it again on return.
	const onVisibility = () => acquire();
	document.addEventListener('visibilitychange', onVisibility);

	return {
		set(on: boolean) {
			wanted = on;
			if (on) acquire();
			else sentinel?.release().catch(() => {});
		},
		destroy() {
			wanted = false;
			sentinel?.release().catch(() => {});
			document.removeEventListener('visibilitychange', onVisibility);
		}
	};
}
