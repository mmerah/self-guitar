// What the mic check can do on the score a ladder plays: single notes (note check), strums (the
// experimental chord check), or neither. Light on purpose: LadderPanel keeps it on every player
// page, and loads the rest of the listening code (lazy.ts) only once Mic is turned on.
import type * as AT from '@coderline/alphatab';
import { buildTimeline, isMonophonic, strumWindows } from './timeline';

export type Engine = { api: AT.AlphaTabApi; at: typeof AT };

export class ScoreProbe {
	/** null until the score is loaded. */
	monophonic = $state<boolean | null>(null);
	strummed = $state(false);
	private poll: ReturnType<typeof setInterval> | undefined;
	private off: (() => void) | null = null;

	constructor(getEngine: () => Engine | null) {
		const attach = () => {
			const e = getEngine();
			if (!e) return;
			clearInterval(this.poll);
			const read = () => {
				const api = e.api;
				if (!api.score || !api.tickCache) return;
				const tl = buildTimeline(api.tickCache as unknown as Parameters<typeof buildTimeline>[0], {
					fallbackTempo: api.score.tempo
				});
				this.monophonic = isMonophonic(tl);
				this.strummed = strumWindows(tl).length > 0;
			};
			this.off = e.api.midiLoaded.on(read);
			read();
		};
		this.poll = setInterval(attach, 200);
		attach();
	}

	destroy() {
		clearInterval(this.poll);
		this.off?.();
	}
}
