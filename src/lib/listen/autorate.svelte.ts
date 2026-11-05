// The Mic check's suggested rating: the checker's verdict on a pass, pre-selected, saving itself
// after a countdown unless the learner taps Clean or Miss first. A new pass's suggestion never
// drops the one before it: a pass shorter than the countdown rates the earlier one first.
import type { PassSummary } from './match';

export type Pending = { clean: boolean; summary: PassSummary; left: number };

export class AutoRate {
	pending = $state<Pending | null>(null);
	private timer: ReturnType<typeof setInterval> | undefined;

	constructor(
		/** Applies a rating (the ladder's rate step), with the pass it judged. */
		private apply: (clean: boolean, summary: PassSummary) => void,
		private seconds = 5
	) {}

	/** A pass was judged: suggest its rating (rating the previous suggestion first). */
	offer(summary: PassSummary) {
		if (this.pending) this.commit();
		this.pending = { clean: summary.clean, summary, left: this.seconds };
		this.timer = setInterval(() => {
			const p = this.pending;
			if (!p) return clearInterval(this.timer);
			p.left--;
			if (p.left <= 0) this.commit();
		}, 1000);
	}

	/** Saves the suggestion as it stands. */
	commit() {
		const p = this.take();
		if (p) this.apply(p.clean, p.summary);
	}

	/** The learner rated by hand: the suggestion's pass goes with their rating. */
	take(): Pending | null {
		const p = this.pending;
		this.cancel();
		return p;
	}

	cancel() {
		clearInterval(this.timer);
		this.pending = null;
	}
}
