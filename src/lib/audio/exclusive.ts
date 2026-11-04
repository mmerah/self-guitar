// One thing plays at a time on a page: starting a tab player, strum pattern or the metronome stops
// whatever else was playing (two clicks at different tempos are never what anyone wants).

let current: (() => void) | null = null;

/** Call when playback starts; `stop` is called if something else starts later. */
export function claimPlayback(stop: () => void) {
	if (current && current !== stop) {
		const prev = current;
		current = null;
		prev();
	}
	current = stop;
}

/** Call when playback stops (or the player goes away). */
export function releasePlayback(stop: () => void) {
	if (current === stop) current = null;
}

/** Whether something is playing on this page (an app update waits for it). */
export function isPlaying() {
	return current !== null;
}
