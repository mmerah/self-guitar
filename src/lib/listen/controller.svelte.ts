// Wires the note checker to a ladder's tab player: the score's timeline (rebuilt on a new score or
// tempo), playback positions, the mic's onsets and levels, and the note marks. LadderPanel owns
// one (loaded lazily, see lazy.ts); the pure parts (timeline, matching, pass bookkeeping) are in
// timeline.ts, match.ts and checker.ts.
//
// A pass is judged only while the mic is really listening: positions are fed to the checker only
// with the mic live and no problem shown, so a denied or failed mic never yields a rating.
import type { MicProblem } from '$lib/tuner/mic';
import { getAudioContext } from '$lib/audio/context';
import { LiveChecker, type PassReport } from './checker';
import { loadLatency } from './latency';
import { MicOnsets } from './mic';
import { NoteOverlay } from './overlay';
import type { Engine } from './probe.svelte';
import { buildTimeline, type Timeline } from './timeline';

export type { Engine };

export class ListenController {
	/** Listening is wanted (toggle on and set up). */
	active = $state(false);
	mode = $state<'notes' | 'chords'>('notes');
	/** The mic is open and delivering (the live indicator). */
	micOn = $state(false);
	problem = $state<MicProblem | null>(null);
	/** Mic level (rms of the last 100 ms), for the indicator. */
	level = $state(0);
	/** The pass playing now, as judged so far (the last pass until the next one's first note). */
	live = $state<PassReport | null>(null);
	latency = $state<number | null>(null);
	/** performance.now() when the mic's stream arrived (0: not open). */
	micOpenedAt = $state(0);

	private engine: Engine | null = null;
	private timeline: Timeline | null = null;
	private score: unknown = null;
	private checker: LiveChecker;
	private mic: MicOnsets | null = null;
	private overlay: NoteOverlay | null = null;
	private off: (() => void)[] = [];
	private poll: ReturnType<typeof setInterval> | undefined;
	private ticker: ReturnType<typeof setInterval> | undefined;
	private stopTimer: ReturnType<typeof setTimeout> | undefined;
	private playing = false;
	private shownPass = -1;
	/** The marks are cleared for a silent pass. */
	private blank = false;

	constructor(
		private getEngine: () => Engine | null,
		private isListenPass: () => boolean,
		private ondone: (r: PassReport) => void
	) {
		this.checker = new LiveChecker({
			update: (r) => this.update(r),
			done: (r) => this.ondone(r)
		});
		this.poll = setInterval(() => this.tryAttach(), 200);
		this.tryAttach();
		this.latencyReady = loadLatency().then((v) => {
			this.latency = v?.ms ?? null;
			this.checker.latency = v?.ms ?? 0;
		});
	}

	/** Resolves once the stored latency (if any) is read. */
	readonly latencyReady: Promise<void>;

	setLatency(ms: number) {
		this.latency = ms;
		this.checker.latency = ms;
	}

	private tryAttach() {
		const e = this.getEngine();
		if (!e) return;
		clearInterval(this.poll);
		this.engine = e;
		const { api } = e;
		this.off.push(
			api.playerPositionChanged.on((ev) => this.position(ev.currentTick)),
			api.playerStateChanged.on((ev) =>
				this.stateChanged(ev.state === e.at.synth.PlayerState.Playing)
			),
			api.midiLoaded.on(() => this.rebuild()),
			api.postRenderFinished.on(() => this.overlay?.layout())
		);
		this.rebuild();
		if (this.active) this.ensureOverlay();
	}

	private ensureOverlay() {
		const e = this.engine;
		if (!e || this.overlay) return;
		this.overlay = new NoteOverlay(e.api);
		// Note bounds are only collected on request: one re-render, then the marks follow layout.
		if (!e.api.settings.core.includeNoteBounds) {
			e.api.settings.core.includeNoteBounds = true;
			e.api.updateSettings();
			e.api.render();
		} else this.overlay.layout();
	}

	/** (Re)reads the score's timeline: a new score, or the ladder's tempo changed. */
	private rebuild() {
		const api = this.engine?.api;
		if (!api?.score || !api.tickCache) return;
		const speed = api.playbackSpeed;
		if (this.timeline && this.score === api.score && this.timeline.speed === speed) return;
		const fresh = this.score !== api.score;
		this.score = api.score;
		this.timeline = buildTimeline(api.tickCache as unknown as Parameters<typeof buildTimeline>[0], {
			speed,
			fallbackTempo: api.score.tempo
		});
		this.checker.setTimeline(this.timeline);
		if (fresh) this.overlay?.clear();
	}

	/** Turns checking on (the toggle, after the explainer); the mic opens when playback starts. */
	enable(mode: 'notes' | 'chords') {
		this.active = true;
		this.mode = mode;
		this.checker.setMode(mode);
		this.ensureOverlay();
		clearInterval(this.ticker);
		this.ticker = setInterval(() => this.checker.tick(performance.now()), 100);
	}

	disable() {
		this.active = false;
		this.live = null;
		clearInterval(this.ticker);
		this.stopMic();
		this.checker.reset();
		this.overlay?.destroy();
		this.overlay = null;
	}

	/**
	 * Playback is starting (inside the gesture, for iOS: Play along, the P key, a resume): open the
	 * mic so it is listening when the count-in ends. A fresh stream per start keeps its clock
	 * aligned with that press.
	 */
	arm() {
		if (!this.active) return;
		clearTimeout(this.stopTimer);
		if (this.mic) return;
		getAudioContext();
		this.problem = null;
		const mic = new MicOnsets(
			{
				onset: (o) => this.checker.onset({ perf: o.perf, freq: o.freq, chroma: o.chroma }),
				level: (rms, _peak, perf) => {
					this.level = rms;
					this.checker.level(perf, rms);
				},
				problem: (p) => this.fail(p)
			},
			this.mode === 'chords' ? 'chords' : 'notes',
			'listen'
		);
		this.mic = mic;
		void mic.start().then((p) => {
			if (this.mic !== mic) return;
			if (p) this.fail(p);
			else {
				this.micOn = true;
				this.micOpenedAt = mic.openedAt;
			}
		});
	}

	/** The mic is live and fine: only then is a pass judged. */
	get judging() {
		return this.active && this.micOn && !this.problem;
	}

	private fail(p: MicProblem) {
		this.problem = p;
		this.checker.abandon();
		this.live = null;
		this.stopMic();
	}

	private stopMic() {
		clearTimeout(this.stopTimer);
		this.mic?.stop();
		this.mic = null;
		this.micOn = false;
		this.level = 0;
	}

	private position(tick: number) {
		if (!this.playing || this.isListenPass() || !this.judging) return;
		this.rebuild();
		this.checker.position(tick, performance.now());
	}

	private stateChanged(playing: boolean) {
		this.playing = playing;
		if (!playing) {
			this.checker.abandon();
			// The mic goes with the playback (battery, and the iOS mic indicator).
			clearTimeout(this.stopTimer);
			this.stopTimer = setTimeout(() => {
				if (!this.playing) this.stopMic();
			}, 1500);
		}
	}

	private update(r: PassReport) {
		if (r.pass !== this.shownPass) {
			// The last pass stays at full strength until this one's first note is judged.
			const started = r.result.notes.some((n) => n.status !== 'pending') || r.chords.length > 0;
			if (!started) return;
			this.shownPass = r.pass;
			this.overlay?.fade();
		}
		this.live = r;
		if (!this.timeline || !this.overlay) return;
		// Next to nothing heard: no marks (a row of "missed" would blame the player for the mic).
		if (r.silent) {
			if (!this.blank) this.overlay.clear();
			this.blank = true;
			return;
		}
		this.blank = false;
		if (this.mode === 'chords') this.overlay.showChords(r.chords);
		else
			this.overlay.show(
				this.timeline.notes.map((n) => n.ref),
				r.result.notes.map((n) => n.status)
			);
	}

	destroy() {
		clearInterval(this.poll);
		clearInterval(this.ticker);
		this.off.forEach((f) => f());
		this.off = [];
		this.stopMic();
		this.overlay?.destroy();
	}
}
