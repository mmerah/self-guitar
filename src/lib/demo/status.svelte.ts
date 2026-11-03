// What the demo tells the learner about its storage (shown by DemoBanner).
export const demoStatus = $state({
	/**
	 * ok · unavailable: IndexedDB could not be read, so the demo runs in memory and never saves ·
	 * quota: the browser's storage is full · failed: a save failed for another reason.
	 */
	storage: 'ok' as 'ok' | 'unavailable' | 'quota' | 'failed',
	/** Another tab writes to the same data (browsers without Web Locks only). */
	otherTab: false,
	/** A one-off message (a backup was made, a write was dropped). */
	notice: '',
	/** A short confirmation at the bottom of the screen. */
	toast: ''
});
