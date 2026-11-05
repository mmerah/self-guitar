<script lang="ts">
	// The tempo ladder: the exercise looping in the player beside big Clean / Miss targets. Used by
	// the exercise page and by session blocks.
	import { onDestroy, onMount, untrack } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import TabPlayer from '$lib/player/TabPlayer.svelte';
	import { recordAttempt } from './client';
	import { parseStrum, scoreMeter, strumSlotInBar } from './strum';
	import StrumRow from './StrumRow.svelte';
	import WhatToPlay from './WhatToPlay.svelte';
	import TuningNotice from './TuningNotice.svelte';
	import { ladderPct, ladderRate, ladderStart, MISSES_TO_DROP, type LadderEvent } from './ladder';
	import { focusOwnsKey, keysSuspended, PEDAL_BACK, PEDAL_NEXT } from '$lib/keys';
	import type { Exercise, ExerciseDetail } from './types';
	import { base } from '$app/paths';
	import { MIC_HELP } from '$lib/tuner/mic';
	// The Mic check's light part: what the score allows. The rest loads on first use (lazy.ts).
	import { ScoreProbe } from '$lib/listen/probe.svelte';
	import { AutoRate } from '$lib/listen/autorate.svelte';
	import type { PassReport } from '$lib/listen/checker';
	import type { PassSummary } from '$lib/listen/match';
	import type { ListenController } from '$lib/listen/controller.svelte';
	import { median } from '$lib/tuner/pitch';
	import {
		chordCheckOn,
		explained,
		listenOn,
		setChordCheckOn,
		setExplained,
		setListenOn
	} from '$lib/listen/prefs';
	import type { HeardPass } from './types';

	let {
		exercise,
		detail,
		mastered = $bindable(false),
		keys = { next: PEDAL_NEXT, back: PEDAL_BACK },
		compact = false,
		onrate
	}: {
		exercise: Exercise;
		detail: ExerciseDetail | null;
		/** Mastered at least once (shown by the page header). */
		mastered?: boolean;
		/** Clean / miss keys (a session block leaves PageDown / Enter to the runner). */
		keys?: { next: string[]; back: string[] };
		/** Session blocks: the tightest layout (the tab gets the room). */
		compact?: boolean;
		/** Every rating, after it is applied locally. */
		onrate?: (r: { bpm: number; clean: boolean; event: LadderEvent; ladderBpm: number }) => void;
	} = $props();
	const ex = $derived(exercise);

	// Resumes exactly where the ladder was left (tempo, streak, misses: stored by the server).
	const resume = (d: ExerciseDetail | null) =>
		d && { bpm: d.resumeBpm, streak: d.streak, misses: d.misses };
	let ladder = $state(untrack(() => ladderStart(exercise, resume(detail))));
	let best = $state(untrack(() => detail?.best ?? null));
	untrack(() => (mastered = detail?.mastered ?? false));
	let event = $state<LadderEvent | null>(null);
	let passes = $state(0);
	let rated = $state(0);
	let saveError = $state('');
	let flash = $state<'clean' | 'miss' | null>(null);
	/** This session's ratings, newest last (shown on wide screens). */
	let log = $state<{ bpm: number; clean: boolean }[]>([]);
	let flashTimer: ReturnType<typeof setTimeout> | undefined;
	/** Ratings sent so far: only the answer to the latest one may replace the local position. */
	let sent = 0;
	let player = $state<ReturnType<typeof TabPlayer>>();
	/** Listened once (or practised before): the next step is to play along. */
	let heard = $state(untrack(() => (detail?.attempts ?? 0) > 0));
	let help = $state(false);
	/** Every step shows until the first clean pass; then they fold to one line. */
	let expanded = $state(true);
	let slot = $state(-1);
	/** Wide or landscape: the steps sit beside the tab, above the ladder (the tab keeps its height). */
	let side = $state(false);
	onMount(() => {
		const q = matchMedia('(min-width: 768px), (max-height: 500px)');
		const on = () => (side = q.matches);
		on();
		q.addEventListener('change', on);
		return () => q.removeEventListener('change', on);
	});

	/** The score's meter (the strum row maps bar positions onto its slots; 6/8 counts 1–6). */
	const meter = $derived(scoreMeter(ex.tex));
	const strum = $derived.by(() => {
		if (!ex.strum) return null;
		const p = parseStrum(ex.strum, undefined, meter.ts);
		return 'slots' in p ? p : null;
	});
	function onPosition(bar: number, frac: number) {
		slot = strum
			? strumSlotInBar(
					{ length: strum.slots.length, sub: strum.sub },
					meter.num,
					bar,
					frac,
					meter.den
				)
			: -1;
	}

	// ---- the Mic check (M7): the mic checks each play-along pass and suggests its rating ---------

	/** Seconds before a suggested rating saves itself (as the session's rating step). */
	const AUTO_ACCEPT_S = 5;
	type ListenModule = typeof import('$lib/listen/lazy');
	const probe = new ScoreProbe(() => player?.engine() ?? null);
	let mod = $state.raw<ListenModule | null>(null);
	let listen = $state.raw<ListenController | null>(null);
	let loading: Promise<ListenController | null> | null = null;
	let destroyed = false;
	/** Loads the listening code (first time Mic is on) and creates the controller. */
	function loadListen(): Promise<ListenController | null> {
		loading ??= import('$lib/listen/lazy').then((m) => {
			if (destroyed) return null;
			mod = m;
			listen = new m.ListenController(
				() => player?.engine() ?? null,
				() => player?.isListening() ?? false,
				(r) => passHeard(r)
			);
			return listen;
		});
		return loading;
	}
	onDestroy(() => {
		destroyed = true;
		probe.destroy();
		listen?.destroy();
		auto.cancel();
	});
	/** The Mic toggle (remembered per device; session blocks inherit it). */
	let micWanted = $state(false);
	let chordCheck = $state(false);
	/** Strummed exercises: the Mic button explains why it is off (and offers the chord check). */
	let micReason = $state(false);
	/** First use: the mic explainer, then the timing test when none is stored. */
	let setup = $state<'explain' | 'calibrate' | null>(null);
	/** The checker's verdict on the last pass, pre-selected with a countdown. */
	const auto = new AutoRate((clean, summary) => rateWith(clean, summary), AUTO_ACCEPT_S);
	const suggestion = $derived(auto.pending);
	let lastSummary = $state<PassSummary | null>(null);
	/** The last pass judged as a whole (the debug hooks read it). */
	let lastReport = $state.raw<PassReport | null>(null);
	/** The last pass was (almost) silent: not rated, the mic needs a look. */
	let unheard = $state(false);
	/** Mic-checked passes, stored and from this visit (newest last; the strip shows 5). */
	let heardLog = $state<HeardPass[]>(untrack(() => detail?.heard ?? []));
	/** Single notes: the note check (the exercise's `listen` flag overrides). */
	const noteCheck = $derived(ex.listen ?? probe.monophonic === true);
	/** Strums: no note check; the experimental chord check when turned on. */
	const strummed = $derived(ex.listen === undefined && !noteCheck && probe.strummed);
	const chordMode = $derived(strummed && chordCheck);
	/** The Mic button works here. */
	const canListen = $derived(noteCheck || chordMode);
	/** Why the Mic button is off here (shown on the disabled button), or null. */
	const micOff = $derived(
		canListen
			? null
			: strummed
				? 'Mic checks single notes; strums coming'
				: ex.listen === false
					? "Mic can't follow this one yet (bends, slides, harmonics)"
					: null
	);
	const listening = $derived(canListen && micWanted && setup === null && !!listen);
	onMount(() => {
		micWanted = listenOn();
		chordCheck = chordCheckOn();
		if (micWanted) void loadListen();
	});
	$effect(() => {
		const l = listen;
		if (!l) return;
		if (listening) untrack(() => l.enable(chordMode ? 'chords' : 'notes'));
		else untrack(() => l.active && l.disable());
	});

	async function toggleMic() {
		if (micWanted) {
			micWanted = false;
			setListenOn(false);
			setup = null;
			unheard = false;
			cancelSuggestion();
			return;
		}
		micWanted = true;
		setListenOn(true);
		const l = await loadListen();
		if (!l || !micWanted) return;
		if (!explained()) setup = 'explain';
		else {
			await l.latencyReady;
			if (micWanted && l.latency === null) setup = 'calibrate';
		}
	}

	async function allowMic() {
		const l = await loadListen();
		if (!l || !mod) return;
		const p = await mod.requestMicPermission();
		if (p) {
			l.problem = p;
			return;
		}
		l.problem = null;
		setExplained();
		await l.latencyReady;
		setup = l.latency === null ? 'calibrate' : null;
	}

	/** Playback is starting (Play along, P, pedal, resume; inside the gesture): open the mic. */
	function beforePlay() {
		if (listening) listen?.arm();
	}

	/** A listened pass ended: show how it went and pre-select Clean or Miss. */
	function passHeard(r: PassReport) {
		// Only a live mic with no problem judges a pass; a resumed half-pass is not judged.
		if (!listen?.judging || r.partial) return;
		if (r.silent) {
			// Nothing (or next to nothing) heard: the mic, not the playing. Not rated, not counted.
			unheard = true;
			return;
		}
		unheard = false;
		lastSummary = r.summary;
		lastReport = r;
		if (listen.mode !== 'notes' || !r.summary.total) return;
		// A short pass can end before the last suggestion saved itself: that one is rated first.
		auto.offer(r.summary);
	}

	function cancelSuggestion() {
		auto.cancel();
	}

	/** Median timing error of the last pass (ms): a hook for end-to-end tests and debugging. */
	const listenDt = $derived.by(() => {
		const dts = ((lastReport ?? listen?.live)?.result.notes ?? []).flatMap((n) =>
			n.dt === undefined ? [] : [n.dt]
		);
		return dts.length ? Math.round(median(dts)) : undefined;
	});
	/** The strip: the last five mic-checked passes. */
	const strip = $derived(heardLog.slice(-5));
	const bestHeard = $derived(
		heardLog.reduce<HeardPass | null>(
			(b, p) => (!b || p.hits / p.total > b.hits / b.total ? p : b),
			null
		)
	);
	/** Mic level for the indicator, 0..1 (square root: quiet playing still shows). */
	const micLevel = $derived(listen?.micOn ? Math.min(1, Math.sqrt(listen.level / 0.05)) : 0);

	const toGo = $derived(ex.cleanReps - ladder.streak);
	/** A pass ended that has not been rated yet: prompt for a rating. */
	const awaiting = $derived(passes > rated);
	const feedbackText = $derived(
		event === 'up'
			? `Up to ${ladder.bpm} BPM. Nice!`
			: event === 'down'
				? `Two misses in a row: back to ${ladder.bpm} BPM. Make it clean here.`
				: event === 'miss'
					? ladder.bpm <= ex.startBpm
						? `Missed: streak reset. Stay at ${ladder.bpm} BPM.`
						: `Missed: streak reset. ${MISSES_TO_DROP - ladder.misses} more miss in a row steps down.`
					: event === 'mastered'
						? `${ex.cleanReps} clean in a row at the target: mastered!`
						: event === 'clean' && ladder.bpm >= ex.targetBpm
							? `Clean at the target! ${toGo} more in a row to master it.`
							: event === 'clean'
								? `Clean! ${toGo} more in a row to go up.`
								: awaiting
									? `Pass ${passes} done: how was it?`
									: heard
										? `Your turn: play along, then rate each pass.`
										: `Start with Listen: one pass at ${ladder.bpm} BPM.`
	);
	/** What the line under the ladder says, and in which tone. */
	const line = $derived.by((): { text: string; tone: 'neutral' | 'warn' | 'muted' | null } => {
		if (suggestion && mod) {
			const best = bestHeard ? ` · best ${bestHeard.hits}/${bestHeard.total}` : '';
			return { text: mod.summaryText(suggestion.summary) + best, tone: 'neutral' };
		}
		if (listening && unheard) return { text: "Didn't hear you — check the mic", tone: 'warn' };
		const live = listen?.live;
		if (listening && listen?.micOn && live && live.summary.total && !live.silent)
			return { text: `Mic: ${live.summary.hits}/${live.summary.total} notes`, tone: 'muted' };
		return { text: feedbackText, tone: null };
	});

	/** A rating by hand (buttons, keys): the suggested pass, if any, goes with it. */
	function rate(clean: boolean) {
		rateWith(clean, auto.take()?.summary);
	}

	function rateWith(clean: boolean, s?: PassSummary) {
		const bpm = ladder.bpm;
		// A mic-checked pass is stored with its accuracy, rated by the checker or overridden.
		const heardPass = s ? { hits: s.hits, total: s.total } : undefined;
		if (heardPass) heardLog = [...heardLog.slice(-9), { ...heardPass, clean, bpm }];
		const next = ladderRate(ex, ladder, clean);
		log = [...log.slice(-23), { bpm, clean }];
		ladder = next.state;
		event = next.event;
		if (clean) {
			best = Math.max(best ?? 0, bpm);
			expanded = false;
		}
		heard = true;
		if (next.event === 'mastered') mastered = true;
		onrate?.({ bpm, clean, event: next.event, ladderBpm: next.state.bpm });
		rated = Math.max(rated + 1, passes);
		flash = clean ? 'clean' : 'miss';
		clearTimeout(flashTimer);
		flashTimer = setTimeout(() => (flash = null), 350);
		navigator.vibrate?.(clean ? 15 : [30, 40, 30]);
		saveError = '';
		const seq = ++sent;
		recordAttempt(ex.id, bpm, clean, heardPass)
			.then((d) => {
				mastered ||= d.mastered;
				// Same rules on both sides; the server's answer to the latest rating wins (answers
				// can arrive out of order).
				if (seq !== sent) return;
				best = d.best;
				ladder = ladderStart(ex, resume(d));
			})
			.catch((e: Error) => (saveError = e.message));
	}

	function onKey(e: KeyboardEvent) {
		// Keys on a focused control (Play, Back, the rating buttons…) do what that control does.
		if (e.repeat || keysSuspended() || focusOwnsKey(e) || e.ctrlKey || e.metaKey || e.altKey)
			return;
		if (e.code === 'KeyP') {
			e.preventDefault();
			player?.playPause();
		} else if (keys.next.includes(e.code)) {
			e.preventDefault();
			rate(true);
		} else if (keys.back.includes(e.code)) {
			e.preventDefault();
			rate(false);
		}
	}

	const startPct = $derived(ladderPct(ex, ladder.bpm));
</script>

<svelte:window onkeydown={onKey} />

<div
	class="relative flex min-h-0 flex-1 flex-col md:flex-row short:flex-row"
	data-testid="ladder-panel"
	data-listen={listening && listen ? listen.mode : 'off'}
	data-mic-live={listen?.micOn ?? false}
	data-unheard={unheard}
	data-listen-dt={listenDt}
	data-listen-origin={lastReport && listen?.micOpenedAt
		? Math.round(lastReport.origin - listen.micOpenedAt)
		: undefined}
	data-listen-summary={lastSummary ? `${lastSummary.hits}/${lastSummary.total}` : undefined}
>
	<div class="flex min-h-0 min-w-0 flex-1 flex-col">
		<TuningNotice tex={ex.tex} />
		{#if !side}<WhatToPlay exercise={ex} bind:expanded />{/if}
		<TabPlayer
			bind:this={player}
			tex={ex.tex}
			bpm={ladder.bpm}
			loopAll
			keyboard={false}
			emphasis={heard ? 'play' : 'listen'}
			onloop={() => passes++}
			onbeforeplay={beforePlay}
			onlistened={() => (heard = true)}
			onposition={onPosition}
		>
			{#snippet under()}
				{#if strum}
					<div class="border-t border-line bg-surface px-2 py-0.5">
						<StrumRow pattern={strum.slots} sub={strum.sub} ts={strum.ts} active={slot} />
					</div>
				{/if}
			{/snippet}
		</TabPlayer>
	</div>

	<div
		class="flex min-h-0 shrink-0 flex-col border-line bg-surface md:w-96 md:border-l short:w-80 short:border-l"
	>
		{#if side}
			<div class="min-h-0 shrink overflow-y-auto">
				<WhatToPlay exercise={ex} bind:expanded />
			</div>
		{/if}
		<!-- Ladder: tempo, streak, big rating targets (usable with a guitar in your hands). -->
		<section
			class="flex shrink-0 flex-col border-t border-line px-3 md:flex-1 md:border-t-0 md:p-5 short:border-t-0 short:p-2 {compact
				? 'gap-1 pt-1 pb-1'
				: 'gap-1.5 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]'}"
			aria-label="Tempo ladder"
			data-testid="ladder"
			data-bpm={ladder.bpm}
			data-streak={ladder.streak}
			data-misses={ladder.misses}
		>
			<div class="flex items-center gap-2.5">
				<p class="shrink-0 leading-none whitespace-nowrap">
					<span
						class="font-bold tabular-nums {compact ? 'text-3xl' : 'text-4xl'}"
						data-testid="ladder-bpm">{ladder.bpm}</span
					>
					<span class="text-sm text-muted">BPM</span>
				</p>
				<span
					class="ml-auto flex shrink-0 flex-col items-center gap-0.5 text-[11px] leading-none text-muted tabular-nums"
					aria-label="{ladder.streak} of {ex.cleanReps} clean passes in a row"
					data-testid="ladder-streak"
				>
					<span aria-hidden="true">clean passes</span>
					<span class="flex items-center gap-1" aria-hidden="true">
						{#each Array.from({ length: ex.cleanReps }, (_, i) => i) as i (i)}
							<span
								class="size-3.5 rounded-full border-2 {i < ladder.streak
									? 'border-ok bg-ok'
									: 'border-line'}"
							></span>
						{/each}
						<span class="text-xs font-semibold text-fg">{ladder.streak}/{ex.cleanReps}</span>
					</span>
				</span>
				{#if canListen}
					<button
						class="btn btn-toggle relative min-w-11 shrink-0 flex-col gap-0 px-1 text-[10px] leading-tight font-medium"
						onclick={toggleMic}
						aria-pressed={micWanted}
						aria-label={chordMode
							? 'Mic: check the chords (experimental)'
							: 'Mic: check every note you play'}
						title={chordMode ? 'Mic: check the chords (experimental)' : 'Mic: check every note'}
						data-testid="listen-toggle"
						data-mic={listen?.micOn ?? false}
						><Icon name="mic" size={20} /><span aria-hidden="true"
							>{chordMode ? 'Chords' : 'Mic'}</span
						>{#if listen?.micOn}<span
								class="mic-live absolute top-1 right-1 size-2 rounded-full bg-danger"
								aria-hidden="true"
								data-testid="mic-live"
							></span><span
								class="absolute inset-x-1.5 bottom-0.5 h-0.5 overflow-hidden rounded-full bg-line"
								aria-hidden="true"
								><span
									class="block h-full bg-ok transition-[width] duration-100"
									style:width="{Math.round(micLevel * 100)}%"
								></span></span
							>{/if}</button
					>
				{:else if micOff}
					<button
						class="btn min-w-11 shrink-0 flex-col gap-0 px-1 text-[10px] leading-tight font-medium opacity-50"
						aria-disabled="true"
						aria-expanded={micReason}
						aria-label="Mic (off here): {micOff}"
						title={micOff}
						onclick={() => (micReason = !micReason)}
						data-testid="listen-toggle-off"
						><Icon name="mic" size={20} /><span aria-hidden="true">Mic</span></button
					>
				{/if}
				<button
					class="btn -mr-1 shrink-0 bg-transparent! px-1 text-muted"
					onclick={() => (help = !help)}
					aria-expanded={help}
					aria-label="How the tempo ladder works"
					data-testid="ladder-help-toggle"><Icon name="help" /></button
				>
			</div>
			<!-- Where the ladder stands between its start and target tempo (its own row: the labels
			     never run into the streak dots). -->
			<div>
				<div
					class="relative h-2 rounded-full bg-surface-2"
					role="progressbar"
					aria-label="Ladder tempo, {ex.startBpm} to {ex.targetBpm} BPM"
					aria-valuemin={ex.startBpm}
					aria-valuemax={ex.targetBpm}
					aria-valuenow={ladder.bpm}
					data-testid="ladder-progress"
				>
					<div
						class="absolute inset-y-0 left-0 rounded-full {mastered ? 'bg-ok' : 'bg-accent'}"
						style:width="{mastered ? 100 : startPct}%"
					></div>
				</div>
				<p
					class="mt-0.5 flex justify-between gap-2 text-xs whitespace-nowrap text-muted tabular-nums"
				>
					<span data-testid="ladder-best">best {best ?? '–'}</span>
					<span>target {ex.targetBpm}</span>
				</p>
			</div>
			{#if micReason && micOff}
				<div
					class="flex flex-col gap-1 rounded-xl bg-surface-2 p-2 text-sm"
					data-testid="mic-reason"
				>
					<p class="text-muted">{micOff}.</p>
					{#if strummed}
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								checked={chordCheck}
								onchange={(e) => {
									chordCheck = e.currentTarget.checked;
									setChordCheckOn(chordCheck);
									if (chordCheck) micReason = false;
								}}
								data-testid="chord-check-toggle"
							/>
							<span><span class="chip">Experimental</span> Check the chords instead</span>
						</label>
					{/if}
				</div>
			{/if}

			<div class="flex items-center gap-2">
				<p
					class="flex min-w-0 flex-1 items-center gap-1 text-sm leading-snug font-medium {line.tone ===
					'neutral'
						? 'text-fg'
						: line.tone === 'warn'
							? 'text-warn'
							: line.tone === 'muted'
								? 'text-muted'
								: event === 'up' || event === 'mastered'
									? 'text-ok'
									: event === 'down' || event === 'miss'
										? 'text-danger'
										: awaiting
											? 'text-accent'
											: 'text-muted'}"
					aria-live="polite"
					data-testid="ladder-feedback"
				>
					{#if line.tone}<Icon name={line.tone === 'warn' ? 'alert' : 'mic'} size={16} />{/if}
					{line.text}
				</p>
				{#if listening && strip.length}
					<span
						class="flex h-5 shrink-0 items-end gap-0.5"
						role="img"
						aria-label="Mic accuracy, last {strip.length} passes: {strip
							.map((p) => `${p.hits}/${p.total}`)
							.join(', ')}"
						title="Mic accuracy, last {strip.length} passes"
						data-testid="accuracy-strip"
					>
						{#each strip as p, i (i)}
							<span
								class="w-1.5 rounded-sm {p.clean ? 'bg-ok' : 'bg-muted/60'}"
								style:height="{Math.max(12, Math.round((p.hits / p.total) * 100))}%"
							></span>
						{/each}
					</span>
				{/if}
			</div>
			{#if listen?.problem && micWanted}
				<div
					class="rounded-xl bg-surface-2 p-2 text-sm"
					role="alert"
					data-testid="mic-problem"
					data-problem={listen.problem}
				>
					<p class="font-semibold text-danger">{MIC_HELP[listen.problem].title}</p>
					<p class="text-muted">{MIC_HELP[listen.problem].body}</p>
				</div>
			{/if}

			{#if help}
				<ul
					class="flex list-disc flex-col gap-0.5 rounded-xl bg-surface-2 py-2 pr-2 pl-6 text-sm text-muted"
					data-testid="ladder-help"
				>
					<li data-testid="clean-definition">
						<b class="text-fg">Clean</b> = every note on time, no buzzes, no stopping.
					</li>
					<li>Listen first, then play along and rate every pass, honestly.</li>
					<li>{ex.cleanReps} clean in a row move up {ex.step} BPM.</li>
					<li>
						{MISSES_TO_DROP} misses in a row step back {ex.step} BPM (never below {ex.startBpm}).
					</li>
					<li>{ex.cleanReps} clean in a row at {ex.targetBpm} BPM masters it.</li>
					<li class="hidden kbd:list-item">
						Keys / pedal: Space or → clean, ← or Backspace miss, P play/pause.
					</li>
					{#if canListen || micOff}
						<li data-testid="mic-help">
							<b class="text-fg">Mic</b>: checks each note as you play along. ✓ on time, ← early, →
							late, ✗ wrong note, ○ missed. A right note an octave off counts as right (on purpose).
							Each pass is rated for you in {AUTO_ACCEPT_S} s; tap to change it. If it hears next to nothing,
							the pass isn't rated.
							<span class="tabular-nums" data-testid="listen-latency"
								>Mic delay {listen?.latency ?? '–'} ms</span
							>
							· <a class="text-accent underline" href="{base}/tools/calibrate">measure it</a>
						</li>
					{/if}
					{#if strummed}
						<li>
							<label class="flex items-center gap-2">
								<input
									type="checkbox"
									checked={chordCheck}
									onchange={(e) => {
										chordCheck = e.currentTarget.checked;
										setChordCheckOn(chordCheck);
									}}
									data-testid="chord-check-toggle-help"
								/>
								<span><span class="chip">Experimental</span> Mic checks the chords here</span>
							</label>
						</li>
					{/if}
				</ul>
			{/if}

			{#if log.length}
				<div class="hidden text-sm md:block short:hidden">
					<h2 class="mb-1 font-semibold">This session</h2>
					<ol class="flex flex-wrap gap-1" data-testid="ladder-log">
						{#each log as r, i (i)}
							<li
								class="chip tabular-nums {r.clean
									? 'bg-ok! text-ok-fg!'
									: 'bg-danger! text-white!'}"
							>
								{r.clean ? '✓' : '✗'}
								{r.bpm}
							</li>
						{/each}
					</ol>
				</div>
			{/if}

			<div class="mt-auto grid grid-cols-2 gap-2">
				<button
					class="btn flex-col gap-0 rounded-2xl border-2 border-danger text-lg text-danger short:min-h-12 {compact
						? 'min-h-12'
						: 'min-h-14'} {flash === 'miss' || suggestion?.clean === false
						? 'bg-danger! text-white!'
						: ''}"
					onclick={() => rate(false)}
					data-testid="ladder-miss"
					data-suggested={suggestion?.clean === false}
				>
					<span class="flex items-center gap-1"
						><Icon name="x" size={24} />Miss{#if suggestion?.clean === false}<span
								class="ml-1 grid size-7 place-items-center rounded-full bg-white/25 text-base font-bold tabular-nums"
								data-testid="rating-countdown"
								aria-label="saves in {suggestion.left} s">{suggestion.left}</span
							>{/if}</span
					>
					<span class="hidden text-xs font-normal opacity-70 kbd:block">← / Backspace</span>
				</button>
				<button
					class="btn flex-col gap-0 rounded-2xl bg-ok! text-lg text-ok-fg! short:min-h-12 {compact
						? 'min-h-12'
						: 'min-h-14'} {flash === 'clean' || suggestion?.clean
						? 'ring-4 ring-ok/50'
						: ''} {suggestion && !suggestion.clean ? 'opacity-60' : ''}"
					onclick={() => rate(true)}
					data-testid="ladder-clean"
					data-suggested={suggestion?.clean === true}
				>
					<span class="flex items-center gap-1"
						><Icon name="check" size={24} />Clean{#if suggestion?.clean}<span
								class="ml-1 grid size-7 place-items-center rounded-full bg-black/15 text-base font-bold tabular-nums"
								data-testid="rating-countdown"
								aria-label="saves in {suggestion.left} s">{suggestion.left}</span
							>{/if}</span
					>
					<span class="hidden text-xs font-normal opacity-70 kbd:block">Space / →</span>
				</button>
			</div>
			{#if saveError}
				<p class="text-sm text-danger" role="alert" data-testid="ladder-save-error">{saveError}</p>
			{/if}
		</section>
	</div>

	{#if setup}
		<!-- First use of the Mic check: what the mic is for, then the timing test (once per device). -->
		<div
			class="absolute inset-x-0 bottom-0 z-40 flex max-h-full flex-col gap-3 overflow-y-auto rounded-t-2xl border-t border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.35)] md:inset-x-auto md:right-4 md:bottom-4 md:w-96 md:rounded-2xl md:border"
			role="dialog"
			aria-label={setup === 'explain' ? 'Check your notes with the mic' : 'Measure the mic delay'}
			data-testid="listen-setup"
			data-step={setup}
		>
			{#if setup === 'explain'}
				<p class="flex items-center gap-2 text-lg font-semibold">
					<Icon name="mic" size={24} />Mic: check every note
				</p>
				<ul class="list-disc pl-5 text-sm text-muted">
					<li>
						As you play along, each note gets a mark: ✓ on time, ← early, → late, ✗ wrong, ○ missed.
					</li>
					<li>Each pass is rated for you; tap to change it.</li>
					<li>Sound stays on this device. Headphones help.</li>
				</ul>
				{#if listen?.problem}
					<div
						class="rounded-xl bg-surface-2 p-2 text-sm"
						role="alert"
						data-testid="mic-problem"
						data-problem={listen.problem}
					>
						<p class="font-semibold text-danger">{MIC_HELP[listen.problem].title}</p>
						<p class="text-muted">{MIC_HELP[listen.problem].body}</p>
					</div>
				{/if}
				<div class="grid grid-cols-2 gap-2">
					<button class="btn" onclick={toggleMic} data-testid="listen-cancel">Not now</button>
					<button class="btn btn-primary" onclick={allowMic} data-testid="listen-allow"
						><Icon name="mic" size={20} />Allow mic</button
					>
				</div>
			{:else if mod}
				<p class="flex items-center justify-between gap-2 text-lg font-semibold">
					Mic timing test
					<button
						class="btn text-sm font-normal"
						onclick={() => (setup = null)}
						data-testid="listen-skip-cal">Skip</button
					>
				</p>
				<p class="text-sm text-muted">
					Measures how late the mic hears you (once per device), so on-time notes count as on time.
				</p>
				<mod.Calibrate
					compact
					ondone={(v) => {
						listen?.setLatency(v.ms);
						setTimeout(() => (setup = null), 900);
					}}
				/>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* Note colours over the tab (src/lib/listen/overlay.ts places the marks). */
	:global(.sg-listen-layer) {
		position: absolute;
		inset: 0 auto auto 0;
		z-index: 2;
		pointer-events: none;
	}
	:global(.sg-listen-mark) {
		position: absolute;
		border-radius: 6px;
		transition:
			background-color 120ms,
			opacity 300ms;
	}
	:global(.sg-listen-mark[data-status='good']) {
		--mark: var(--ok);
	}
	:global(.sg-listen-mark[data-status='off']) {
		--mark: var(--warn);
	}
	:global(.sg-listen-mark[data-status='bad']) {
		--mark: var(--danger);
	}
	:global(.sg-listen-mark[data-status]) {
		background: color-mix(in srgb, var(--mark) 28%, transparent);
		box-shadow: 0 0 0 2px var(--mark);
	}
	/* The glyph (colour is never the only cue): a small badge above the fret number. */
	:global(.sg-listen-mark[data-glyph]::after) {
		content: attr(data-glyph);
		position: absolute;
		left: 50%;
		bottom: 100%;
		transform: translate(-50%, -1px);
		min-width: 14px;
		padding: 0 2px;
		border-radius: 7px;
		background: var(--mark);
		color: var(--bg);
		font:
			bold 11px/14px system-ui,
			sans-serif;
		text-align: center;
	}
	:global(.sg-listen-mark.stale) {
		opacity: 0.35;
	}
	:global([data-theme='light'] .sg-listen-mark[data-status]) {
		background: color-mix(in srgb, var(--mark) 22%, transparent);
		box-shadow: 0 0 0 2.5px var(--mark);
	}
	:global([data-theme='light'] .sg-listen-mark.stale) {
		opacity: 0.5;
	}
	/* The mic is live: a slow pulse on the Mic button's dot. */
	.mic-live {
		animation: mic-pulse 1.4s ease-in-out infinite;
	}
	@keyframes mic-pulse {
		50% {
			opacity: 0.25;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.mic-live {
			animation: none;
		}
	}
	:global(.sg-listen-bar) {
		position: absolute;
		font:
			bold 15px/1 system-ui,
			sans-serif;
	}
	:global(.sg-listen-bar[data-status='good']) {
		color: var(--ok);
	}
	:global(.sg-listen-bar[data-status='bad']) {
		color: var(--danger);
	}
</style>
