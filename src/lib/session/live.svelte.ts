// The running session as reactive state, shared by the runner and the slim session bar on
// `?from=session` pages: the block clock only runs while one of them is mounted, the page is
// visible and the learner has not paused; every change is saved at once (a reload resumes it);
// other tabs' changes arrive through the `storage` event.
import { getAudioContext } from '$lib/audio/context';
import { playClick } from '$lib/metronome/scheduler';
import {
	blockLimitMs,
	elapsedMs,
	heartbeat,
	recoverClock,
	saveLocal,
	SESSION_STORAGE_KEY,
	startClock,
	stopClock,
	type LocalSession
} from './client';

const HEARTBEAT_MS = 5_000;

export class LiveSession {
	s = $state<LocalSession | null>(null);
	now = $state(Date.now());

	elapsed = $derived(this.s ? elapsedMs(this.s, this.now) : 0);
	total = $derived(this.s ? blockLimitMs(this.s) : 0);
	remaining = $derived(Math.max(0, this.total - this.elapsed));

	/** Saves the current state (call after every change). */
	save() {
		if (this.s) saveLocal($state.snapshot(this.s) as LocalSession);
	}

	/** Changes the session and saves it. */
	update(fn: (s: LocalSession) => void) {
		if (!this.s) return;
		fn(this.s);
		this.now = Date.now();
		this.save();
	}

	/**
	 * Takes over a session read from storage and runs the clock while mounted; returns the
	 * cleanup (stops the clock). `onTimeUp` fires once per block when its time runs out.
	 */
	attach(session: LocalSession, onTimeUp?: () => void): () => void {
		recoverClock(session);
		this.s = session;
		this.now = Date.now();
		if (document.visibilityState === 'visible') startClock(this.s, this.now);
		this.save();
		let lastBeat = this.now;
		const tick = setInterval(() => {
			const s = this.s;
			this.now = Date.now();
			if (!s) return;
			if (s.phase === 'play' && !s.timeUp && s.since !== null && this.remaining <= 0) {
				s.timeUp = true;
				this.save();
				onTimeUp?.();
			}
			if (this.now - lastBeat >= HEARTBEAT_MS) {
				lastBeat = this.now;
				heartbeat(s, this.now);
				this.save();
			}
		}, 250);
		const hide = () => this.update((s) => stopClock(s, Date.now()));
		const visibility = () => {
			if (document.visibilityState === 'hidden') hide();
			else this.update((s) => startClock(s, Date.now()));
		};
		const storage = (e: StorageEvent) => {
			if (e.key !== SESSION_STORAGE_KEY) return;
			const next = e.newValue ? (JSON.parse(e.newValue) as LocalSession | null) : null;
			if (!next) return;
			this.s = next;
			this.now = Date.now();
			// Another tab stopped the clock as it was hidden: this visible one carries on.
			if (document.visibilityState === 'visible' && next.since === null && !next.endedAt) {
				startClock(this.s, this.now);
				if (this.s.since !== null) this.save();
			}
		};
		document.addEventListener('visibilitychange', visibility);
		addEventListener('pagehide', hide);
		addEventListener('storage', storage);
		return () => {
			clearInterval(tick);
			document.removeEventListener('visibilitychange', visibility);
			removeEventListener('pagehide', hide);
			removeEventListener('storage', storage);
			if (this.s) {
				stopClock(this.s, Date.now());
				this.save();
			}
		};
	}
}

/** Two soft accents and a buzz: the block's time is up (the screen says it too). */
export function chime() {
	try {
		const ctx = getAudioContext();
		playClick(ctx, ctx.currentTime + 0.01, 'accent');
		playClick(ctx, ctx.currentTime + 0.25, 'accent');
	} catch {
		// no audio
	}
	navigator.vibrate?.([120, 80, 120]);
}

export const clock = (ms: number) => {
	const t = Math.ceil(ms / 1000);
	return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
