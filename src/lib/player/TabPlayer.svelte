<script lang="ts" module>
	export type Loop = { start: number; end: number }; // 0-based bar indexes, inclusive
	export type PlayerPrefs = { tempoPct: number; loop: Loop | null };
</script>

<script lang="ts">
	import { base } from '$app/paths';
	import { onMount, untrack } from 'svelte';
	import type * as AT from '@coderline/alphatab';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import { claimPlayback, releasePlayback } from '$lib/audio/exclusive';
	import { scoreTempo } from '$lib/learn/ladder';
	import { barNumber, clampTempo, TEMPO_MAX, TEMPO_MIN, TEMPO_PRESETS } from '$lib/progress';
	import Mixer, { type MixerTrack } from './Mixer.svelte';
	import { createWakeLock } from './wakeLock';

	let {
		tex,
		initialTempoPct = 100,
		initialLoop = null,
		compact = false,
		bpm: fixedBpm,
		loopAll = false,
		keyboard,
		onchange,
		onplay,
		onloop
	}: {
		tex: string;
		initialTempoPct?: number;
		initialLoop?: Loop | null;
		/**
		 * Inline mode for lessons: sized to the tab, one row of controls (play, stop, tempo, repeat).
		 * alphaTab renders only near the screen and is torn down far from it; the synth (and its
		 * SoundFont) starts on the first Play tap.
		 */
		compact?: boolean;
		/** Plays at this BPM, set by the parent (tempo ladder): the tempo controls are hidden. */
		bpm?: number;
		/** Repeat the whole piece (no A-B loop picking). */
		loopAll?: boolean;
		/** Space toggles playback (default: full players only; off when the page uses Space). */
		keyboard?: boolean;
		/** Fired when tempo or loop change (to persist them). */
		onchange?: (prefs: PlayerPrefs) => void;
		/** Fired when playback starts. */
		onplay?: (prefs: PlayerPrefs) => void;
		/** Fired each time playback reaches the end (every pass when repeating). */
		onloop?: () => void;
	} = $props();

	let viewport: HTMLDivElement;
	let host: HTMLDivElement;
	let api: AT.AlphaTabApi | undefined;
	let alphaTab: typeof AT | undefined;

	// UI state
	let rendered = $state(false);
	let ready = $state(false); // SoundFont + MIDI loaded: playback possible
	let soundFontPct = $state(0);
	let error = $state<string | null>(null);
	let playing = $state(false);
	// Initial values only: the parent re-creates the player per song.
	let tempoPct = $state(untrack(() => clampTempo(initialTempoPct)));
	let loop = $state<Loop | null>(untrack(() => initialLoop));
	let pickingLoop = $state<null | 'start' | 'end'>(null);
	let pickStart = 0;
	let countIn = $state(false);
	let metronome = $state(false);
	let notation = $state(false);
	let mixerOpen = $state(false);
	let wide = $state(false); // >= md: mixer is a side panel instead of a sheet
	let tracks = $state<MixerTrack[]>([]);
	let barCount = $state(0);
	let pickup = $state(false); // first bar is an anacrusis: printed bar numbers start after it
	let currentBar = $state(0);
	let baseTempo = $state(0);
	let barRects = $state('[]');
	// Compact mode: repeat the snippet (on by default); loopAll: always.
	let repeat = $state(untrack(() => loopAll || compact));
	/** Compact players create the synth on the first Play tap, then start playing when ready. */
	let synthOn = $state(untrack(() => !compact));
	let playWhenReady = false;
	/** Height kept while a far-away compact player is torn down (no layout jump). */
	let parkedHeight = $state(0);

	const useKeyboard = $derived(keyboard ?? !compact);
	// Lesson/ladder players: the BPM shown by the page is the only tempo, and strum directions are
	// the lesson's arrows (alphaTab draws a brush-down as an up arrow, tab-style).
	const plain = $derived(compact || fixedBpm !== undefined);
	// The tempo written in the score, known before alphaTab loads.
	const writtenTempo = $derived(scoreTempo(tex));
	const bpm = $derived(fixedBpm ?? Math.round(((baseTempo || writtenTempo) * tempoPct) / 100));
	const speed = () => (fixedBpm && baseTempo ? fixedBpm / baseTempo : tempoPct / 100);
	// Status texts use the bar numbers printed in the score.
	const barStatus = $derived(
		barCount
			? currentBar === 0 && pickup
				? 'Pickup bar'
				: `Bar ${barNumber(currentBar, pickup)}/${barCount - (pickup ? 1 : 0)}`
			: 'Bar –'
	);
	const loopStatus = $derived(
		loop ? `Loop: bars ${barNumber(loop.start, pickup)}–${barNumber(loop.end, pickup)}` : ''
	);
	const prefs = (): PlayerPrefs => ({ tempoPct, loop: loop ? { ...loop } : null });

	function readPref(key: string) {
		try {
			return localStorage.getItem(key) === '1';
		} catch {
			return false;
		}
	}
	function writePref(key: string, on: boolean) {
		try {
			localStorage.setItem(key, on ? '1' : '0');
		} catch {
			// per-device convenience only
		}
	}

	// Tab only (with rhythm stems under the tab) or standard notation + tab.
	function staveSettings(at: typeof AT) {
		return { staveProfile: notation ? at.StaveProfile.ScoreTab : at.StaveProfile.Tab };
	}
	function rhythmMode(at: typeof AT) {
		return notation ? at.TabRhythmMode.Hidden : at.TabRhythmMode.ShowWithBars;
	}

	function themeColors() {
		const css = getComputedStyle(document.documentElement);
		const v = (name: string) => css.getPropertyValue(name).trim();
		return {
			mainGlyphColor: v('--text'),
			secondaryGlyphColor: v('--muted'),
			staffLineColor: v('--muted'),
			barSeparatorColor: v('--muted'),
			barNumberColor: v('--accent'),
			scoreInfoColor: v('--text')
		};
	}

	function applyTheme() {
		if (!api || !alphaTab) return;
		const res = api.settings.display.resources;
		for (const [key, value] of Object.entries(themeColors())) {
			res[key as keyof ReturnType<typeof themeColors>] = alphaTab.model.Color.fromJson(value)!;
		}
		api.updateSettings();
		api.render();
	}

	/** Bar index (0-based) containing a MIDI tick. */
	function barAtTick(tick: number) {
		if (!api?.score || !api.tickCache) return 0;
		let index = 0;
		for (const mb of api.score.masterBars) {
			if (api.tickCache.getMasterBarStart(mb) <= tick) index = mb.index;
			else break;
		}
		return index;
	}

	let wakeLock: ReturnType<typeof createWakeLock> | undefined;
	let destroyed = false;
	let generation = 0; // bumps on teardown: a pending init for an old instance stops

	/** Stops our playback when another player starts. */
	const pauseForOther = () => api?.pause();

	function init() {
		if (api || destroyed) return;
		const gen = ++generation;
		(async () => {
			// alphaTab touches window/document on import: load it on the client only.
			alphaTab = await import('@coderline/alphatab');
			if (destroyed || gen !== generation) return;
			const { LayoutMode, NotationElement, PlayerMode, ScrollMode } = alphaTab;
			const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
			// Large enough to read on a music stand: bigger on tablets/desktops.
			const small = Math.min(innerWidth, innerHeight) < 600;
			const scale = compact ? (small ? 1.2 : 1.4) : small ? 1.5 : 1.75;
			const sans = getComputedStyle(document.body).fontFamily;

			const created = new alphaTab.AlphaTabApi(host, {
				core: { fontDirectory: `${base}/font/`, engine: 'svg' },
				display: {
					// Wrapped systems, scrolling vertically (like Songsterr's mobile view).
					layoutMode: LayoutMode.Page,
					...staveSettings(alphaTab),
					scale,
					// Tighter spacing on phones so two bars fit per line where possible.
					stretchForce: scale < 1.6 ? 0.7 : 1,
					padding: [8, 12],
					systemPaddingTop: 6,
					resources: {
						...themeColors(),
						// Chord names, section markers and texts in the app's sans font.
						elementFonts: new Map([
							[NotationElement.EffectChordNames, `bold 13px ${sans}`],
							[NotationElement.EffectMarker, `bold 13px ${sans}`],
							[NotationElement.EffectText, `12px ${sans}`],
							[NotationElement.EffectLyrics, `13px ${sans}`],
							[NotationElement.BarNumber, `bold 11px ${sans}`],
							[NotationElement.ScoreTitle, `bold 22px ${sans}`],
							[NotationElement.ScoreMusic, `13px ${sans}`]
						])
					}
				},
				notation: {
					rhythmMode: rhythmMode(alphaTab),
					// Title/composer are in the page header already; dynamics are noise for practice.
					elements: new Map([
						[NotationElement.ScoreTitle, false],
						[NotationElement.ScoreMusic, false],
						[NotationElement.ScoreWordsAndMusic, false],
						[NotationElement.EffectDynamics, false],
						// The page shows the one tempo that plays (ladder BPM, compact readout).
						[NotationElement.EffectTempo, !plain],
						// Down/up-stroke marks would contradict the lesson's ↓/↑ arrows.
						[NotationElement.EffectPickStroke, !plain],
						[NotationElement.GuitarTuning, false]
					])
				},
				player: {
					// Compact players: no synth (no SoundFont download) until the first Play tap.
					playerMode: synthOn ? PlayerMode.EnabledSynthesizer : PlayerMode.Disabled,
					soundFont: `${base}/soundfont/sonivox.sf3.bin`,
					scrollElement: viewport,
					scrollMode: compact ? ScrollMode.Off : ScrollMode.Continuous,
					// Lead-in: keep the playing system a little below the top edge.
					scrollOffsetY: -Math.round(viewport.clientHeight * 0.12),
					nativeBrowserSmoothScroll: !reducedMotion,
					scrollSpeed: reducedMotion ? 0 : 300,
					enableCursor: true,
					enableAnimatedBeatCursor: !reducedMotion,
					enableElementHighlighting: true,
					enableSeekToClick: true,
					// Loops are picked by tapping two bars (works the same with touch and mouse).
					enablePlaybackRangeSelection: false
				}
			} as AT.json.SettingsJson);
			api = created;

			// Brush strokes: hidden from the drawing, kept for the sound. The model has them only
			// while alphaTab generates the MIDI; renders (also re-renders) see none.
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- not state: a lookup for the MIDI step
			const brushes = new Map<AT.model.Beat, AT.model.BrushType>();
			if (plain) {
				const generate = created.loadMidiForScore.bind(created);
				created.loadMidiForScore = () => {
					for (const [beat, type] of brushes) beat.brushType = type;
					try {
						generate();
					} finally {
						for (const beat of brushes.keys()) beat.brushType = 0 as AT.model.BrushType;
					}
				};
			}

			created.scoreLoaded.on((score) => {
				// Bar numbers on every bar, in tab-only mode too.
				const { BarNumberDisplay, SystemDisplay } = alphaTab!.model;
				score.stylesheet.barNumberDisplay = BarNumberDisplay.AllBars;
				// The "TAB" clef only on the first system: more room for bars on narrow screens.
				const clef = score.stylesheet.tabConfig.clef;
				if (clef) clef.systemDisplay = SystemDisplay.FirstSystemOnly;
				if (plain) {
					brushes.clear();
					for (const track of score.tracks)
						for (const staff of track.staves)
							for (const bar of staff.bars)
								for (const voice of bar.voices)
									for (const beat of voice.beats)
										if (beat.brushType) {
											brushes.set(beat, beat.brushType);
											beat.brushType = 0 as AT.model.BrushType;
										}
				}
				baseTempo = score.tempo;
				barCount = score.masterBars.length;
				pickup = !!score.masterBars[0]?.isAnacrusis;
				tracks = score.tracks.map((t) => ({
					index: t.index,
					name: t.name,
					mute: false,
					solo: false,
					volume: 1
				}));
				if (loop && (loop.end >= barCount || loop.start > loop.end)) loop = null;
			});
			created.renderFinished.on(() => {
				if (!rendered) viewport.scrollTo(0, 0);
				rendered = true;
				parkedHeight = 0;
				if (ready) highlightLoop();
			});
			// Bar positions (relative to the tab) as a stable hook for end-to-end tests.
			created.postRenderFinished.on(() => {
				const bounds = created.boundsLookup?.staffSystems.flatMap((s) => s.bars) ?? [];
				barRects = JSON.stringify(
					bounds.map(({ visualBounds: b }) => [b.x, b.y, b.w, b.h].map(Math.round))
				);
			});
			created.soundFontLoad.on((e) => {
				soundFontPct = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
			});
			created.playerReady.on(() => {
				ready = true;
				created.playbackSpeed = speed();
				created.countInVolume = countIn ? 1 : 0;
				created.metronomeVolume = metronome ? 1 : 0;
				applyLoop(false);
				if (playWhenReady) {
					playWhenReady = false;
					playPause();
				}
			});
			created.playerStateChanged.on((e) => {
				const nowPlaying = e.state === alphaTab!.synth.PlayerState.Playing;
				if (nowPlaying && !playing) onplay?.(prefs());
				if (nowPlaying) claimPlayback(pauseForOther);
				else releasePlayback(pauseForOther);
				playing = nowPlaying;
				wakeLock?.set(nowPlaying);
			});
			// Fires while playing, on seek (tap) and on stop: keeps "Bar N/M" in sync.
			created.playerPositionChanged.on((e) => {
				currentBar = barAtTick(e.currentTick);
			});
			created.playerFinished.on(() => onloop?.());
			created.beatMouseDown.on((beat) => pickBar(beat.voice.bar.index));
			created.error.on((e) => {
				error = e.message;
			});

			created.tex(tex, 'all');
		})().catch((e: Error) => {
			error = e.message;
		});
	}

	/** Frees alphaTab (renderer, synth worker) while a compact player is far off-screen. */
	function teardown() {
		generation++;
		if (!api) return;
		parkedHeight = host.offsetHeight;
		releasePlayback(pauseForOther);
		api.destroy();
		api = undefined;
		// alphaTab owns this element's children (Svelte renders none in it).
		// eslint-disable-next-line svelte/no-dom-manipulating
		host.replaceChildren();
		rendered = ready = playing = false;
		synthOn = !compact;
		playWhenReady = false;
		soundFontPct = 0;
	}

	onMount(() => {
		wakeLock = createWakeLock();
		// Inline snippets play straight away, tab only (no toggles to change it there).
		if (!compact) {
			countIn = readPref('player.countIn');
			metronome = readPref('player.metronome');
			notation = readPref('player.notation');
		}

		const wideQuery = matchMedia('(min-width: 768px)');
		const onWide = () => (wide = wideQuery.matches);
		onWide();
		wideQuery.addEventListener('change', onWide);

		// Re-colour the tab when the app theme changes.
		const themeObserver = new MutationObserver(applyTheme);
		themeObserver.observe(document.documentElement, { attributeFilter: ['data-theme'] });

		// Inline players: alphaTab starts near the screen and is destroyed far from it (a lesson can
		// hold many of them), unless it is playing.
		const observers: IntersectionObserver[] = [];
		if (compact && 'IntersectionObserver' in window) {
			const near = new IntersectionObserver(
				(entries) => entries.some((e) => e.isIntersecting) && init(),
				{
					rootMargin: '300px 0px'
				}
			);
			const far = new IntersectionObserver(
				(entries) => {
					if (entries.every((e) => !e.isIntersecting) && !playing) teardown();
				},
				{ rootMargin: '1500px 0px' }
			);
			near.observe(viewport);
			far.observe(viewport);
			observers.push(near, far);
		} else init();

		return () => {
			destroyed = true;
			for (const o of observers) o.disconnect();
			stopRepeat();
			wideQuery.removeEventListener('change', onWide);
			themeObserver.disconnect();
			wakeLock?.destroy();
			releasePlayback(pauseForOther);
			api?.destroy();
			api = undefined;
		};
	});

	// The parent's BPM (tempo ladder) applies live, also mid-playback.
	$effect(() => {
		const next = fixedBpm && baseTempo ? fixedBpm / baseTempo : null;
		if (next !== null && api && ready) api.playbackSpeed = next;
	});

	// ---- transport -------------------------------------------------------------------------

	/** Play/pause (also for the parent page's own shortcut, via bind:this). */
	export function playPause() {
		if (!api || !alphaTab) return;
		// iOS: let audio play even with the ring/silent switch on (Safari 16.4+ Audio Session API).
		const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
		if (session) session.type = 'playback';
		if (!synthOn) {
			// First tap on a compact player: create the synth (inside the tap, for iOS) and play
			// once the SoundFont is in.
			synthOn = true;
			playWhenReady = true;
			api.settings.player.playerMode = alphaTab.PlayerMode.EnabledSynthesizer;
			api.updateSettings();
			return;
		}
		if (!ready) {
			playWhenReady = !playWhenReady;
			return;
		}
		api.playPause();
	}

	function stop() {
		api?.stop();
	}

	function setTempo(v: number) {
		const next = clampTempo(v);
		if (next === tempoPct) return;
		tempoPct = next;
		if (api) api.playbackSpeed = tempoPct / 100;
		onchange?.(prefs());
	}

	// ±5 buttons: one step per tap, repeating while held.
	let repeatTimer: ReturnType<typeof setTimeout> | undefined;
	function startRepeat(e: PointerEvent, delta: number) {
		if (e.button !== 0) return;
		stopRepeat();
		setTempo(tempoPct + delta);
		const tick = (delay: number) => {
			repeatTimer = setTimeout(() => {
				setTempo(tempoPct + delta);
				tick(110);
			}, delay);
		};
		tick(450);
	}
	function stopRepeat() {
		clearTimeout(repeatTimer);
		repeatTimer = undefined;
	}
	/** Keyboard activation (pointer presses are handled by startRepeat). */
	function stepKey(e: MouseEvent, delta: number) {
		if (e.detail === 0) setTempo(tempoPct + delta);
	}

	function toggleCountIn() {
		countIn = !countIn;
		writePref('player.countIn', countIn);
		if (api) api.countInVolume = countIn ? 1 : 0;
	}

	function toggleMetronome() {
		metronome = !metronome;
		writePref('player.metronome', metronome);
		if (api) api.metronomeVolume = metronome ? 1 : 0;
	}

	function toggleNotation() {
		notation = !notation;
		writePref('player.notation', notation);
		if (!api || !alphaTab) return;
		api.settings.display.staveProfile = staveSettings(alphaTab).staveProfile;
		api.settings.notation.rhythmMode = rhythmMode(alphaTab);
		api.updateSettings();
		api.render();
	}

	// ---- A-B loop ----------------------------------------------------------------------------

	function firstBeat(bar: number) {
		return api!.score!.tracks[0].staves[0].bars[bar].voices[0].beats[0];
	}
	function lastBeat(bar: number) {
		const beats = api!.score!.tracks[0].staves[0].bars[bar].voices[0].beats;
		return beats[beats.length - 1];
	}

	function highlightLoop() {
		if (!api?.score) return;
		if (loop) api.highlightPlaybackRange(firstBeat(loop.start), lastBeat(loop.end));
		else api.clearPlaybackRangeHighlight();
	}

	/** Pushes `loop` into alphaTab: playback range (whole bars), highlight and looping flag. */
	function applyLoop(seek = true) {
		if (!api?.score || !api.tickCache || !alphaTab) return;
		const tc = api.tickCache;
		const bars = api.score.masterBars;
		if (loop) {
			const range = new alphaTab.synth.PlaybackRange();
			range.startTick = tc.getMasterBarStart(bars[loop.start]);
			range.endTick =
				(loop.end + 1 < bars.length ? tc.getMasterBarStart(bars[loop.end + 1]) : api.endTick) - 50;
			api.playbackRange = range;
			api.isLooping = true;
			if (seek) api.tickPosition = range.startTick;
		} else {
			api.playbackRange = null;
			api.isLooping = repeat;
		}
		if (rendered) highlightLoop();
	}

	function setLoop(next: Loop | null) {
		loop = next;
		applyLoop();
		onchange?.(prefs());
	}

	function toggleLoop() {
		if (loop || pickingLoop) {
			pickingLoop = null;
			setLoop(null);
		} else {
			pickingLoop = 'start';
		}
	}

	function pickBar(bar: number) {
		if (pickingLoop === 'start') {
			pickStart = bar;
			pickingLoop = 'end';
			loop = { start: bar, end: bar };
			highlightLoop();
		} else if (pickingLoop === 'end') {
			pickingLoop = null;
			setLoop({ start: Math.min(pickStart, bar), end: Math.max(pickStart, bar) });
		}
	}

	// ---- mixer -------------------------------------------------------------------------------

	function trackOf(t: MixerTrack) {
		return [api!.score!.tracks[t.index]];
	}
	function toggleMute(t: MixerTrack) {
		t.mute = !t.mute;
		api?.changeTrackMute(trackOf(t), t.mute);
	}
	function toggleSolo(t: MixerTrack) {
		t.solo = !t.solo;
		api?.changeTrackSolo(trackOf(t), t.solo);
	}
	function setVolume(t: MixerTrack, volume: number) {
		t.volume = volume;
		api?.changeTrackVolume(trackOf(t), volume);
	}

	function toggleRepeat() {
		repeat = !repeat;
		if (api && !loop) api.isLooping = repeat;
	}

	/** Compact tempo buttons: ±5 BPM (kept as a percentage of the written tempo). */
	function stepBpm(delta: number) {
		const base = baseTempo || writtenTempo;
		setTempo(((bpm + delta) / base) * 100);
	}

	function onKey(e: KeyboardEvent) {
		if (!useKeyboard) return;
		const target = e.target as HTMLElement;
		if (e.code === 'Space' && !['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) {
			e.preventDefault();
			playPause();
		}
	}

	const toggles: {
		label: string;
		icon: IconName;
		pressed: () => boolean;
		onclick: () => void;
		testid?: string;
	}[] = [
		{
			label: 'Loop',
			icon: 'loop',
			pressed: () => !!loop || !!pickingLoop,
			onclick: toggleLoop,
			testid: 'loop-button'
		},
		{ label: 'Count-in', icon: 'countin', pressed: () => countIn, onclick: toggleCountIn },
		{ label: 'Metronome', icon: 'metronome', pressed: () => metronome, onclick: toggleMetronome },
		{
			label: 'Notation',
			icon: 'notation',
			pressed: () => notation,
			onclick: toggleNotation,
			testid: 'notation-button'
		}
	];
</script>

<svelte:window onkeydown={onKey} onpointerup={stopRepeat} onpointercancel={stopRepeat} />

{#snippet playButton(extra: string, iconSize: number)}
	{@const loading = synthOn && !ready}
	<button
		class="btn btn-primary {extra}"
		onclick={playPause}
		disabled={compact ? !rendered : !ready}
		aria-label={loading ? 'Loading sounds' : playing ? 'Pause' : 'Play'}
		data-testid="play-button"
		data-playing={playing}
	>
		{#if loading && rendered}
			<span class="text-xs tabular-nums">{soundFontPct}%</span>
		{:else}
			<Icon name={playing ? 'pause' : 'play'} size={iconSize} />
		{/if}
	</button>
{/snippet}

{#snippet stopButton()}
	<button class="btn" onclick={stop} disabled={!ready} aria-label="Stop">
		<Icon name="stop" />
	</button>
{/snippet}

{#snippet mixer()}
	<Mixer
		{tracks}
		onmute={toggleMute}
		onsolo={toggleSolo}
		onvolume={setVolume}
		onclose={() => (mixerOpen = false)}
	/>
{/snippet}

<div
	class={compact
		? 'flex flex-col overflow-hidden rounded-xl border border-line bg-surface'
		: 'flex min-h-0 flex-1'}
	data-testid="tab-player"
	data-compact={compact}
	data-rendered={rendered}
	data-ready={ready}
>
	<div class="flex min-w-0 flex-1 flex-col">
		<!-- Tab -->
		<div
			class="relative isolate {compact ? 'min-h-28' : 'min-h-0 flex-1'}"
			style:min-height={parkedHeight ? `${parkedHeight}px` : undefined}
		>
			<div
				bind:this={viewport}
				class="tab-viewport overflow-auto overscroll-contain {compact
					? 'relative max-h-[55vh]'
					: 'absolute inset-0'}"
				data-testid="tab-viewport"
			>
				<div bind:this={host} data-bar-rects={barRects}></div>
			</div>
			{#if !rendered && !error}
				<div class="absolute inset-0 grid place-items-center text-lg text-muted" role="status">
					Loading tab…
				</div>
			{:else if synthOn && !ready && !error}
				<div
					class="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center"
					role="status"
					data-testid="sound-loading"
				>
					<span
						class="flex items-center gap-3 rounded-full border border-line bg-surface px-4 py-2 text-base shadow-lg"
					>
						Loading sounds… {soundFontPct}%
						<span class="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2">
							<span class="block h-full bg-accent" style:width="{soundFontPct}%"></span>
						</span>
					</span>
				</div>
			{/if}
			{#if error}
				<div
					class="absolute inset-x-4 top-4 rounded-xl bg-danger p-3 text-sm text-white"
					role="alert"
				>
					Could not load the player: {error}
				</div>
			{/if}
			{#if pickingLoop}
				<div
					class="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center"
					role="status"
					data-testid="loop-hint"
				>
					<span
						class="rounded-full bg-accent px-4 py-1.5 text-base font-medium text-accent-fg shadow"
					>
						{pickingLoop === 'start' ? 'Tap the first bar of the loop' : 'Now tap the last bar'}
					</span>
				</div>
			{/if}
			<!-- Short screens: bar/loop status floats over the tab (no room under the controls). -->
			<p
				class="pointer-events-none absolute right-2 bottom-2 z-10 hidden rounded-full border border-line bg-surface/90 px-3 py-1 text-base font-medium tabular-nums {compact
					? ''
					: 'short:block'}"
				aria-hidden="true"
			>
				{barStatus}{#if loop && !pickingLoop}<span class="text-(--loop-edge)"
						>{` · ${loopStatus}`}</span
					>{/if}
			</p>
			{#if mixerOpen && !wide}
				<!-- Non-modal sheet over the tab: the transport below stays usable. -->
				<div
					class="absolute inset-x-0 bottom-0 z-20 max-h-[75%] overflow-auto rounded-t-2xl border-t border-line bg-surface p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.3)]"
				>
					{@render mixer()}
				</div>
			{/if}
		</div>

		{#if compact}
			<div class="flex items-center gap-1 border-t border-line px-2 py-1.5" data-testid="controls">
				{@render playButton('rounded-full', 24)}
				{@render stopButton()}
				<button
					class="btn"
					onclick={toggleRepeat}
					aria-pressed={repeat}
					aria-label="Repeat"
					title="Repeat"><Icon name="loop" /></button
				>
				<span class="ml-auto flex items-center gap-1">
					<button
						class="btn"
						onclick={() => stepBpm(-5)}
						disabled={tempoPct <= TEMPO_MIN}
						aria-label="Slower">−</button
					>
					<span
						class="w-16 text-center text-sm font-semibold tabular-nums"
						data-testid="tempo-value">{bpm} BPM</span
					>
					<button
						class="btn"
						onclick={() => stepBpm(5)}
						disabled={tempoPct >= TEMPO_MAX}
						aria-label="Faster">+</button
					>
				</span>
			</div>
		{:else}
			<!-- Controls: bottom bar, in thumb reach. One row on short (landscape phone) screens. -->
			<div
				class="border-t border-line bg-surface px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] short:pt-1 short:pb-[max(0.25rem,env(safe-area-inset-bottom))]"
				data-testid="controls"
			>
				<div
					class="mx-auto flex max-w-4xl flex-col gap-2 short:flex-row short:items-center short:gap-1"
				>
					{#if fixedBpm === undefined}
						<!-- Tempo -->
						<div
							class="flex flex-wrap items-center gap-x-2 gap-y-1.5 short:flex-nowrap short:gap-1"
						>
							<button
								class="btn"
								onpointerdown={(e) => startRepeat(e, -5)}
								onpointerleave={stopRepeat}
								onclick={(e) => stepKey(e, -5)}
								oncontextmenu={(e) => e.preventDefault()}
								disabled={tempoPct <= TEMPO_MIN}
								aria-label="Slower">−5</button
							>
							<input
								type="range"
								min={TEMPO_MIN}
								max={TEMPO_MAX}
								step="1"
								value={tempoPct}
								oninput={(e) => setTempo(Number(e.currentTarget.value))}
								class="h-11 min-w-0 flex-1 accent-(--accent) short:hidden"
								aria-label="Tempo percent"
								data-testid="tempo-slider"
							/>
							<button
								class="btn"
								onpointerdown={(e) => startRepeat(e, 5)}
								onpointerleave={stopRepeat}
								onclick={(e) => stepKey(e, 5)}
								oncontextmenu={(e) => e.preventDefault()}
								disabled={tempoPct >= TEMPO_MAX}
								aria-label="Faster">+5</button
							>
							<span class="w-16 text-right leading-tight tabular-nums short:order-first short:w-14">
								<span class="block text-lg font-semibold" data-testid="tempo-value"
									>{tempoPct}%</span
								>
								{#if baseTempo}<span class="block text-xs text-muted">{bpm} bpm</span>{/if}
							</span>
							<div
								class="order-last flex basis-full justify-between gap-1.5 md:order-none md:basis-auto short:order-none short:basis-auto"
								role="group"
								aria-label="Tempo presets"
							>
								{#each TEMPO_PRESETS as preset (preset)}
									<button
										class="btn flex-1 rounded-full px-2 tabular-nums md:flex-none short:flex-none"
										aria-pressed={tempoPct === preset}
										aria-label="Tempo {preset}%"
										data-testid="tempo-preset"
										onclick={() => setTempo(preset)}>{preset}%</button
									>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Transport + toggles -->
					<div class="flex items-center justify-between gap-1 short:ml-auto short:justify-end">
						{@render stopButton()}
						{@render playButton(
							'relative min-h-14 min-w-14 rounded-full short:min-h-12 short:min-w-12',
							28
						)}
						{#each toggles.filter((t) => !(loopAll && t.label === 'Loop')) as t (t.label)}
							<button
								class="btn"
								onclick={t.onclick}
								aria-pressed={t.pressed()}
								aria-label={t.label === 'Loop' && loop ? 'Clear loop' : t.label}
								title={t.label}
								data-testid={t.testid}
							>
								<Icon name={t.icon} /><span class="hidden md:inline short:hidden">{t.label}</span>
							</button>
						{/each}
						<button
							class="btn"
							onclick={() => (mixerOpen = !mixerOpen)}
							aria-pressed={mixerOpen}
							aria-label="Mixer"
							title="Mixer"
							data-testid="mixer-button"
						>
							<Icon name="mixer" />
						</button>
					</div>
				</div>
				<p
					class="mx-auto mt-1 flex max-w-4xl justify-between gap-2 text-base font-medium tabular-nums short:hidden"
					aria-live="polite"
				>
					<span data-testid="bar-status">{barStatus}</span>
					{#if loop && !pickingLoop}
						<span class="text-(--loop-edge)" data-testid="loop-status">{loopStatus}</span>
					{/if}
				</p>
			</div>
		{/if}
	</div>

	{#if mixerOpen && wide}
		<div class="w-80 shrink-0 overflow-auto border-l border-line bg-surface p-4">
			{@render mixer()}
		</div>
	{/if}
</div>

<style>
	/*
	 * alphaTab cursor + selection styling (elements are created by alphaTab). They are 100x100px
	 * boxes scaled with a CSS transform, so sizes are in % of the bar (or x100 for widths).
	 * The cursor layer goes behind the notation so the played digit stays readable.
	 */
	.tab-viewport :global(.at-cursors) {
		z-index: 0 !important;
	}
	.tab-viewport :global(.at-surface) {
		position: relative;
		z-index: 1;
	}
	/* Current bar: tint + accent band on top. */
	.tab-viewport :global(.at-cursor-bar) {
		background: linear-gradient(to bottom, var(--accent) 0 4%, var(--cursor-bar) 4%);
	}
	/* Beat cursor: wide translucent band (1400px x 1/100 scale = 14px). */
	.tab-viewport :global(.at-cursor-beat) {
		background: var(--cursor-beat);
		width: 1400px !important;
		border-radius: 400px;
	}
	/* A-B loop: lighter blue tint + blue band at the bottom, so the current bar stays dominant. */
	.tab-viewport :global(.at-selection div) {
		background: linear-gradient(to top, var(--loop-edge) 0 4%, var(--loop-tint) 4%);
	}
	.tab-viewport :global(.at-highlight *) {
		fill: var(--accent);
		stroke: var(--accent);
	}
	.tab-viewport {
		-webkit-overflow-scrolling: touch;
		touch-action: pan-x pan-y;
	}
	@media (prefers-reduced-motion: reduce) {
		.tab-viewport {
			scroll-behavior: auto;
		}
		.tab-viewport :global(.at-cursor-beat) {
			transition: none !important;
		}
	}
</style>
