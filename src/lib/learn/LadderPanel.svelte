<script lang="ts">
	// The tempo ladder: the exercise looping in the player beside big Clean / Miss targets. Used by
	// the exercise page and by session blocks.
	import { onMount, untrack } from 'svelte';
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

	const toGo = $derived(ex.cleanReps - ladder.streak);
	/** A pass ended that has not been rated yet: prompt for a rating. */
	const awaiting = $derived(passes > rated);
	const feedback = $derived(
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

	function rate(clean: boolean) {
		const bpm = ladder.bpm;
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
		recordAttempt(ex.id, bpm, clean)
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

<div class="flex min-h-0 flex-1 flex-col md:flex-row short:flex-row">
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
				<!-- Where the ladder stands between its start and target tempo. -->
				<div class="min-w-0 flex-1">
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
				<span
					class="flex shrink-0 flex-col items-center gap-0.5 text-[11px] leading-none text-muted tabular-nums"
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
				<button
					class="btn -mr-1 shrink-0 bg-transparent! px-1 text-muted"
					onclick={() => (help = !help)}
					aria-expanded={help}
					aria-label="How the tempo ladder works"
					data-testid="ladder-help-toggle"><Icon name="help" /></button
				>
			</div>

			<p
				class="text-sm leading-snug font-medium {event === 'up' || event === 'mastered'
					? 'text-ok'
					: event === 'down' || event === 'miss'
						? 'text-danger'
						: awaiting
							? 'text-accent'
							: 'text-muted'}"
				aria-live="polite"
				data-testid="ladder-feedback"
			>
				{feedback}
			</p>

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
						: 'min-h-14'} {flash === 'miss' ? 'bg-danger! text-white!' : ''}"
					onclick={() => rate(false)}
					data-testid="ladder-miss"
				>
					<span class="flex items-center gap-1"><Icon name="x" size={24} />Miss</span>
					<span class="hidden text-xs font-normal opacity-70 kbd:block">← / Backspace</span>
				</button>
				<button
					class="btn flex-col gap-0 rounded-2xl bg-ok! text-lg text-ok-fg! short:min-h-12 {compact
						? 'min-h-12'
						: 'min-h-14'} {flash === 'clean' ? 'ring-4 ring-ok/50' : ''}"
					onclick={() => rate(true)}
					data-testid="ladder-clean"
				>
					<span class="flex items-center gap-1"><Icon name="check" size={24} />Clean</span>
					<span class="hidden text-xs font-normal opacity-70 kbd:block">Space / →</span>
				</button>
			</div>
			{#if saveError}
				<p class="text-sm text-danger" role="alert" data-testid="ladder-save-error">{saveError}</p>
			{/if}
		</section>
	</div>
</div>
