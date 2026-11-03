<script lang="ts">
	import { untrack } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import TabPlayer from '$lib/player/TabPlayer.svelte';
	import { recordAttempt } from '$lib/learn/client';
	import {
		ladderPct,
		ladderRate,
		ladderStart,
		MISSES_TO_DROP,
		type LadderEvent
	} from '$lib/learn/ladder';
	import { focusOwnsKey, PEDAL_BACK, PEDAL_NEXT } from '$lib/keys';
	import type { ExerciseDetail } from '$lib/learn/types';

	let { data } = $props();
	const ex = $derived(data.exercise);

	// Resumes exactly where the ladder was left (tempo, streak, misses: stored by the server).
	const resume = (d: ExerciseDetail | null) =>
		d && { bpm: d.resumeBpm, streak: d.streak, misses: d.misses };
	let ladder = $state(untrack(() => ladderStart(data.exercise, resume(data.detail))));
	let best = $state(untrack(() => data.detail?.best ?? null));
	let mastered = $state(untrack(() => data.detail?.mastered ?? false));
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

	const toGo = $derived(ex.cleanReps - ladder.streak);
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
								: `${ex.cleanReps} clean passes in a row move up ${ex.step} BPM.`
	);
	/** A pass ended that has not been rated yet: prompt for a rating. */
	const awaiting = $derived(passes > rated);

	function rate(clean: boolean) {
		const bpm = ladder.bpm;
		const next = ladderRate(ex, ladder, clean);
		log = [...log.slice(-23), { bpm, clean }];
		ladder = next.state;
		event = next.event;
		if (clean) best = Math.max(best ?? 0, bpm);
		if (next.event === 'mastered') mastered = true;
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
		if (e.repeat || focusOwnsKey(e) || e.ctrlKey || e.metaKey || e.altKey) return;
		if (e.code === 'KeyP') {
			e.preventDefault();
			player?.playPause();
		} else if (PEDAL_NEXT.includes(e.code)) {
			e.preventDefault();
			rate(true);
		} else if (PEDAL_BACK.includes(e.code)) {
			e.preventDefault();
			rate(false);
		}
	}

	const back = $derived(data.from ? `/learn/${data.from.id}` : '/learn');
	const startPct = $derived(ladderPct(ex, ladder.bpm));
</script>

<svelte:head><title>{ex.title} · Self-Guitar</title></svelte:head>
<svelte:window onkeydown={onKey} />

<div class="flex h-dvh flex-col">
	<header class="flex items-center gap-2 border-b border-line bg-surface px-2 py-1 short:py-0">
		<a href={back} class="btn bg-transparent!" aria-label="Back"><Icon name="back" /></a>
		<div class="min-w-0 flex-1">
			<h1 class="truncate leading-tight font-semibold">{ex.title}</h1>
			<p class="truncate text-xs text-muted">
				Tempo ladder · {ex.startBpm} → {ex.targetBpm} BPM{data.from ? ` · ${data.from.title}` : ''}
			</p>
		</div>
		{#if mastered}
			<span class="chip mr-2 bg-ok! text-ok-fg!" data-testid="ladder-mastered"
				><Icon name="star" size={14} />Mastered</span
			>
		{/if}
	</header>

	<div class="flex min-h-0 flex-1 flex-col md:flex-row short:flex-row">
		<div class="flex min-h-0 flex-1 flex-col">
			<TabPlayer
				bind:this={player}
				tex={ex.tex}
				bpm={ladder.bpm}
				loopAll
				keyboard={false}
				onloop={() => passes++}
			/>
		</div>

		<!-- Ladder: big rating targets, usable with a guitar in your hands. -->
		<section
			class="flex flex-col gap-2 overflow-y-auto border-t border-line bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:w-96 md:border-t-0 md:border-l md:p-5 short:w-80 short:border-t-0 short:border-l short:p-2"
			aria-label="Tempo ladder"
			data-testid="ladder"
			data-bpm={ladder.bpm}
			data-streak={ladder.streak}
			data-misses={ladder.misses}
		>
			<div class="flex items-end justify-between gap-3">
				<div>
					<span class="text-5xl font-bold tabular-nums short:text-4xl" data-testid="ladder-bpm"
						>{ladder.bpm}</span
					>
					<span class="text-muted">BPM</span>
				</div>
				<div class="text-right text-sm">
					<div class="text-muted">Target {ex.targetBpm}</div>
					<div class="font-semibold tabular-nums" data-testid="ladder-best">
						Best clean {best ?? '–'}
					</div>
				</div>
			</div>

			<!-- Where the ladder stands between its start and target tempo. -->
			<div>
				<div
					class="relative h-2.5 rounded-full bg-surface-2"
					role="progressbar"
					aria-label="Ladder tempo"
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
				<div class="mt-0.5 flex justify-between text-xs text-muted tabular-nums">
					<span>{ex.startBpm}</span><span>{ex.targetBpm} BPM</span>
				</div>
			</div>

			<div class="flex items-start gap-2">
				<span
					class="mt-0.5 flex shrink-0 gap-1.5"
					aria-label="{ladder.streak} of {ex.cleanReps} clean in a row"
				>
					{#each Array.from({ length: ex.cleanReps }, (_, i) => i) as i (i)}
						<span
							class="size-4 rounded-full border-2 {i < ladder.streak
								? 'border-ok bg-ok'
								: 'border-line'}"
						></span>
					{/each}
				</span>
				<p
					class="min-w-0 flex-1 text-sm leading-snug font-medium {event === 'up' ||
					event === 'mastered'
						? 'text-ok'
						: event === 'down' || event === 'miss'
							? 'text-danger'
							: 'text-muted'}"
					aria-live="polite"
					data-testid="ladder-feedback"
				>
					{feedback}
				</p>
			</div>

			<p class="text-xs text-muted" data-testid="clean-definition">
				<b class="text-fg">Clean</b> = every note on time, no buzzes, no stopping.
			</p>

			<details class="text-sm" data-testid="ladder-help">
				<summary class="cursor-pointer py-1 font-semibold">How it works</summary>
				<ul class="mt-1 flex list-disc flex-col gap-1 pl-5 text-muted">
					<li>Loop the exercise and rate every pass, honestly.</li>
					<li>{ex.cleanReps} clean passes in a row move up {ex.step} BPM.</li>
					<li>
						A miss resets the streak; {MISSES_TO_DROP} misses in a row step back {ex.step} BPM (never
						below {ex.startBpm}).
					</li>
					<li>{ex.cleanReps} clean in a row at {ex.targetBpm} BPM masters it.</li>
					<li class="hidden pointer-fine:list-item">
						Keys / pedal: Space or → clean, ← or Backspace miss, P play/pause.
					</li>
				</ul>
			</details>

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

			<p class="mt-auto text-center text-sm font-medium {awaiting ? 'text-accent' : 'text-muted'}">
				{awaiting ? `Pass ${passes} done: how was it?` : 'Play a pass, then rate it'}
			</p>

			<div class="grid grid-cols-2 gap-2">
				<button
					class="btn min-h-20 flex-col gap-0 rounded-2xl border-2 border-danger text-lg text-danger short:min-h-16 {flash ===
					'miss'
						? 'bg-danger! text-white!'
						: ''}"
					onclick={() => rate(false)}
					data-testid="ladder-miss"
				>
					<span class="flex items-center gap-1"><Icon name="x" size={28} />Miss</span>
					<span class="hidden text-xs font-normal opacity-70 pointer-fine:block">← / Backspace</span
					>
				</button>
				<button
					class="btn min-h-20 flex-col gap-0 rounded-2xl bg-ok! text-lg text-ok-fg! short:min-h-16 {flash ===
					'clean'
						? 'ring-4 ring-ok/50'
						: ''}"
					onclick={() => rate(true)}
					data-testid="ladder-clean"
				>
					<span class="flex items-center gap-1"><Icon name="check" size={28} />Clean</span>
					<span class="hidden text-xs font-normal opacity-70 pointer-fine:block">Space / →</span>
				</button>
			</div>
			{#if saveError}
				<p class="text-sm text-danger" role="alert" data-testid="ladder-save-error">{saveError}</p>
			{/if}
		</section>
	</div>
</div>
