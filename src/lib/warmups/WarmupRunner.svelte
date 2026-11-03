<script lang="ts">
	// A warm-up routine, step by step: a timed stretch, an inline tab with its tempo, a strum
	// pattern with its click, or an exercise's tempo ladder, each with its own countdown. Used by
	// /warmups/[id] and by the session's warm-up block. Ends on a short "Done" summary.
	// Hands-free: each step's player starts by itself, and the step moves on with a chime when its
	// time is up (a ladder step when it is mastered, or at its time cap). A pedal moves on early.
	import { base } from '$app/paths';
	import { onDestroy } from 'svelte';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import { chime } from '$lib/audio/chime';
	import { chordRef } from '$lib/chords';
	import ChordDiagram from '$lib/chords/ChordDiagram.svelte';
	import { focusOwnsKey, keysSuspended, LADDER_SESSION_KEYS } from '$lib/keys';
	import type { Warmup, WarmupStep } from '$lib/content/schema';
	import LadderPanel from '$lib/learn/LadderPanel.svelte';
	import StrumPattern from '$lib/learn/StrumPattern.svelte';
	import StrumRow from '$lib/learn/StrumRow.svelte';
	import WhatToPlay from '$lib/learn/WhatToPlay.svelte';
	import { loadExercise } from '$lib/learn/client';
	import { scoreTempo } from '$lib/learn/ladder';
	import { parseStrum } from '$lib/learn/strum';
	import type { LearnIndex, StrumSlot } from '$lib/learn/types';
	import TabPlayer from '$lib/player/TabPlayer.svelte';
	import { stepKind, stepSeconds, type StepKind } from './steps';

	let {
		warmup,
		index,
		compact = false,
		minutes,
		onfinish
	}: {
		warmup: Warmup;
		index: LearnIndex;
		/** Session block: no intro card (the block says what to do), tighter layout. */
		compact?: boolean;
		/** The session's warm-up slot: a longer routine is trimmed to fit it. */
		minutes?: number;
		/** The last step is done. */
		onfinish?: (summary: { seconds: number; steps: number }) => void;
	} = $props();

	/** A ladder step waits to be mastered, at most this many times its share of the routine. */
	const LADDER_CAP = 2;
	/** Pedal / keys: next step and previous step (a ladder step keeps Space / → for "clean"). */
	const NEXT_KEYS = ['PageDown', 'Enter', 'NumpadEnter', 'ArrowDown'];
	const NEXT_FREE = ['ArrowRight', 'Space'];
	const BACK_KEYS = ['PageUp', 'ArrowUp'];

	const ICON: Record<StepKind, IconName> = {
		timer: 'timer',
		atex: 'play',
		strum: 'down',
		exercise: 'metronome'
	};

	const times = $derived(stepSeconds(warmup, minutes));
	const totalMin = $derived(Math.max(1, Math.round(times.reduce((a, x) => a + x, 0) / 60)));
	let phase = $state<'intro' | 'run' | 'done'>('intro');
	let idx = $state(0);
	/** Seconds spent in the current step (paused time excluded). */
	let spent = $state(0);
	let total = $state(0);
	let paused = $state(false);
	let stepsDone = $state(0);
	let tick: ReturnType<typeof setInterval> | undefined;
	let last = 0;
	let slot = $state(-1);

	const step = $derived<WarmupStep | null>(phase === 'run' ? (warmup.steps[idx] ?? null) : null);
	const kind = $derived(step ? stepKind(step) : null);
	/** This step's time: its share, or for a ladder step the cap it may run to. */
	const limit = $derived((times[idx] ?? 0) * (kind === 'exercise' ? LADDER_CAP : 1));
	const left = $derived(Math.max(0, limit - Math.floor(spent)));
	const following = $derived(phase === 'run' ? (warmup.steps[idx + 1] ?? null) : null);
	const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

	const label = (s: WarmupStep): string => {
		if ('text' in s && s.text) return s.text;
		if ('exercise' in s)
			return index.exercises.find((e) => e.id === s.exercise)?.title ?? s.exercise;
		if ('strum' in s && !('atex' in s)) return `Strum ${s.strum}${s.chord ? ` on ${s.chord}` : ''}`;
		return warmup.howTo[0];
	};

	function startTimer() {
		clearInterval(tick);
		last = Date.now();
		tick = setInterval(() => {
			const now = Date.now();
			const dt = (now - last) / 1000;
			last = now;
			if (paused) return;
			spent += dt;
			total += dt;
			if (warmup.steps[idx] && spent >= limit) {
				chime();
				next();
			}
		}, 250);
	}

	function start() {
		phase = 'run';
		idx = 0;
		spent = 0;
		total = 0;
		stepsDone = 0;
		paused = false;
		startTimer();
	}

	function next() {
		stepsDone = Math.max(stepsDone, idx + 1);
		slot = -1;
		if (idx + 1 >= warmup.steps.length) return finish();
		idx++;
		spent = 0;
	}

	/** A ladder step mastered: a moment to see it, then on to the next step. */
	function onRate(event: string) {
		if (event !== 'mastered') return;
		const at = idx;
		setTimeout(() => {
			if (phase === 'run' && idx === at) {
				chime();
				next();
			}
		}, 1500);
	}

	function onKey(e: KeyboardEvent) {
		if (phase !== 'run' || keysSuspended() || e.repeat || e.ctrlKey || e.metaKey || e.altKey)
			return;
		if (focusOwnsKey(e)) return;
		const ladder = kind === 'exercise';
		// In a session the runner's PageDown / Enter end the block: the step keys are ↓ / → there.
		const nextKeys = compact ? ['ArrowDown'] : NEXT_KEYS;
		if (nextKeys.includes(e.code) || (!ladder && NEXT_FREE.includes(e.code))) {
			e.preventDefault();
			next();
		} else if (BACK_KEYS.includes(e.code)) {
			e.preventDefault();
			back();
		}
	}

	function back() {
		if (idx === 0) return;
		idx--;
		spent = 0;
		slot = -1;
	}

	function finish() {
		clearInterval(tick);
		phase = 'done';
		stepsDone = warmup.steps.length;
		onfinish?.({ seconds: Math.round(total), steps: stepsDone });
	}

	onDestroy(() => clearInterval(tick));

	/** Strum row under an inline tab: the slot being played. */
	function onPosition(slots: number, perBar: number, bar: number, frac: number) {
		if (bar < 0) return void (slot = -1);
		const bars = Math.max(1, Math.round(slots / perBar));
		slot = ((bar % bars) * perBar + Math.min(perBar - 1, Math.floor(frac * perBar))) % slots;
	}
	const strumOf = (s: WarmupStep): StrumSlot[] | null => {
		if (!('strum' in s) || !s.strum) return null;
		const p = parseStrum(s.strum);
		return 'slots' in p ? p.slots : null;
	};
	const beatsOf = (tex: string) => Number(/\\ts\s*\(?\s*(\d+)/.exec(tex)?.[1] ?? 4);
</script>

<svelte:window onkeydown={onKey} />

{#snippet preview(s: WarmupStep)}
	{@const ex = 'exercise' in s ? index.exercises.find((e) => e.id === s.exercise) : undefined}
	{@const chords =
		('chords' in s && s.chords) || ex?.chords || ('chord' in s && s.chord ? [s.chord] : [])}
	{@const slots = strumOf(s) ?? (ex?.strum ? strumOf({ strum: ex.strum, bpm: 60 }) : null)}
	<div
		class="flex w-full max-w-sm flex-col items-center gap-2 rounded-2xl bg-surface-2 p-3"
		data-testid="warmup-next-preview"
	>
		<p class="text-sm">
			<span class="text-muted">Next:</span> <b>{label(s)}</b>
		</p>
		{#if chords.length}
			<div class="flex gap-2">
				{#each chords.slice(0, 4) as c (c)}
					{@const r = chordRef(c)}
					{#if r}
						<div class="w-16 text-center">
							<span class="text-sm font-bold">{r.chord.id}</span>
							<ChordDiagram voicing={r.voicing} label="{r.chord.id} diagram" mini />
						</div>
					{/if}
				{/each}
			</div>
		{/if}
		{#if slots}<div class="w-full"><StrumRow pattern={slots} /></div>{/if}
	</div>
{/snippet}

<div
	class="flex min-h-0 flex-1 flex-col"
	data-testid="warmup-runner"
	data-phase={phase}
	data-step={idx}
	data-kind={kind}
>
	{#if phase === 'intro'}
		<div class="mx-auto flex w-full max-w-lg flex-1 flex-col gap-3 overflow-y-auto p-3">
			{#if !compact}
				<ol
					class="list-decimal pl-5 text-[15px] leading-snug marker:font-semibold marker:text-accent"
					data-testid="warmup-howto"
				>
					{#each warmup.howTo as h, i (i)}<li>{h}</li>{/each}
				</ol>
			{/if}
			<ol class="flex flex-col gap-1" data-testid="warmup-steps">
				{#each warmup.steps as s, i (i)}
					<li class="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
						<span class="text-accent"><Icon name={ICON[stepKind(s)]} size={18} /></span>
						<span class="min-w-0 flex-1 truncate">{label(s)}</span>
						<span class="text-muted tabular-nums">{fmt(times[i])}</span>
					</li>
				{/each}
			</ol>
			<button class="btn btn-primary min-h-14 text-lg" onclick={start} data-testid="warmup-start">
				<Icon name="play" />Start · {totalMin} min
			</button>
		</div>
	{:else if phase === 'run' && step}
		<div class="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
			<!-- Step bar: where you are, the step's countdown, back / next. -->
			<div class="flex items-center gap-2 border-b border-line bg-surface px-3 py-1.5">
				<span
					class="flex min-w-0 flex-1 gap-1"
					aria-label="Step {idx + 1} of {warmup.steps.length}"
				>
					{#each warmup.steps as _, i (i)}
						<span
							class="h-1.5 max-w-5 min-w-1 flex-1 rounded-full {i < idx
								? 'bg-accent'
								: i === idx
									? 'bg-accent/60'
									: 'bg-surface-2'}"
						></span>
					{/each}
				</span>
				<span class="text-xs whitespace-nowrap text-muted" data-testid="warmup-step-label"
					>Step {idx + 1}/{warmup.steps.length}</span
				>
				{#if kind !== 'timer'}
					<span
						class="text-lg font-bold tabular-nums {left === 0 ? 'text-ok' : ''}"
						role="timer"
						aria-label="Time left in this step"
						data-testid="warmup-timer">{fmt(left)}</span
					>
				{/if}
				<button
					class="btn px-2"
					onclick={() => (paused = !paused)}
					aria-label={paused ? 'Resume' : 'Pause'}
					aria-pressed={paused}
					data-testid="warmup-pause"><Icon name={paused ? 'play' : 'pause'} size={20} /></button
				>
				<button class="btn px-2" onclick={back} disabled={idx === 0} aria-label="Previous step"
					><Icon name="back" size={20} /></button
				>
				<button
					class="btn px-3 {left === 0 || kind === 'strum' ? 'btn-primary' : ''}"
					onclick={next}
					data-testid="warmup-next"
					>{idx + 1 === warmup.steps.length ? 'Done' : 'Next'}<Icon
						name="forward"
						size={18}
					/></button
				>
			</div>
			{#key idx}
				{#if 'timer' in step}
					<div
						class="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-4 text-center"
						data-testid="warmup-stretch"
					>
						<p class="max-w-sm text-xl leading-snug font-semibold">{step.text}</p>
						<p
							class="text-6xl font-extrabold text-accent tabular-nums"
							role="timer"
							aria-label="Time left in this step"
							data-testid="warmup-timer"
						>
							{fmt(left)}
						</p>
						{#if following}{@render preview(following)}{/if}
					</div>
				{:else if 'exercise' in step}
					{@const ex = index.exercises.find((e) => e.id === step.exercise)}
					{#if ex}
						{#await loadExercise(fetch, ex.id)}
							<p class="p-4 text-muted">Loading the ladder…</p>
						{:then detail}
							<LadderPanel
								exercise={ex}
								{detail}
								compact
								keys={LADDER_SESSION_KEYS}
								onrate={(r) => onRate(r.event)}
							/>
						{/await}
					{/if}
				{:else if 'atex' in step}
					{@const slots = strumOf(step)}
					{@const tempo = scoreTempo(step.atex)}
					<div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
						<WhatToPlay
							exercise={{ howTo: step.text ? [step.text] : warmup.howTo, chords: step.chords }}
						/>
						<div class="p-2">
							<TabPlayer
								tex={step.atex}
								compact
								autoplay
								initialTempoPct={warmup.startBpm && tempo ? (warmup.startBpm / tempo) * 100 : 100}
								onposition={(bar, frac) =>
									slots && onPosition(slots.length, beatsOf(step.atex) * 2, bar, frac)}
							>
								{#snippet under()}
									{#if slots}
										<div class="border-t border-line bg-surface px-2 py-0.5">
											<StrumRow pattern={slots} active={slot} />
										</div>
									{/if}
								{/snippet}
							</TabPlayer>
							{#if warmup.targetBpm}
								<p class="mt-1 text-center text-xs text-muted">
									Start at {warmup.startBpm}, work up to {warmup.targetBpm} BPM
								</p>
							{/if}
						</div>
					</div>
				{:else if 'strum' in step}
					<div class="flex flex-1 flex-col items-center justify-center overflow-y-auto p-3">
						<div class="w-full max-w-md">
							{#if step.text}<p class="mb-2 text-center text-[15px]">{step.text}</p>{/if}
							<StrumPattern
								pattern={strumOf(step) ?? []}
								bpm={step.bpm}
								chord={step.chord}
								autoplay
							/>
						</div>
					</div>
				{/if}
			{/key}
		</div>
	{:else if phase === 'done'}
		<div
			class="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-3 p-4 text-center"
			data-testid="warmup-done"
		>
			<span class="rounded-full bg-ok p-3 text-ok-fg"><Icon name="check" size={32} /></span>
			<p class="text-2xl font-bold">Warmed up</p>
			<p class="text-muted tabular-nums" data-testid="warmup-summary">
				{fmt(total)} · {stepsDone} of {warmup.steps.length} steps
			</p>
			{#if !compact}
				<div class="flex w-full gap-2">
					<button class="btn flex-1" onclick={start}><Icon name="loop" />Again</button>
					<a class="btn btn-primary flex-1" href="{base}/library?tab=warmups">More warm-ups</a>
				</div>
			{/if}
		</div>
	{/if}
</div>
