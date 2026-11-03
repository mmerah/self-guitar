<script lang="ts">
	import { base } from '$app/paths';
	// The session runner: one block at a time, its clock counting only active time, a soft
	// time's-up banner (the block keeps playing), then a rating suggested from what the block
	// measured. Hands-free: PageDown / Enter = Done, then → / PageDown accepts the rating.
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import { getOptional } from '$lib/api';
	import { focusOwnsKey, RUNNER_ACCEPT, RUNNER_DONE, suspendKeys } from '$lib/keys';
	import { createWakeLock } from '$lib/player/wakeLock';
	import BlockSurface from '$lib/session/BlockSurface.svelte';
	import WeekDays from '$lib/session/WeekDays.svelte';
	import {
		activeSession,
		api,
		countedSec,
		sendWrite,
		fromStored,
		inferRating,
		startClock,
		stopClock,
		storedSession,
		type BlockNote,
		type LocalSession
	} from '$lib/session/client';
	import type { Goals } from '$lib/session/goals';
	import { dueIn, KIND, whatToDo } from '$lib/session/labels';
	import { lessonPractice } from '$lib/session/practice';
	import { chime, clock, LiveSession } from '$lib/session/live.svelte';
	import {
		RATING_EMOJI,
		RATING_LABEL,
		RATINGS,
		type BlockResult,
		type Rating,
		type SessionSummary,
		type StoredSession
	} from '$lib/session/types';

	let { data } = $props();

	const live = new LiveSession();
	const s = $derived(live.s);
	let missing = $state(false);
	let confirmEnd = $state(false);
	let help = $state(false);
	let goals = $state<Goals | null>(null);
	/** A changes round is running: the Done key waits for it. */
	let busy = $state(false);
	/** Rating step: the selected rating (suggested or tapped), the tempo field, the countdown. */
	let selected = $state<Rating | null>(null);
	let suggested = $state(false);
	let bpm = $state<number | null>(null);
	let autoLeft = $state<number | null>(null);
	let autoTimer: ReturnType<typeof setInterval> | undefined;
	let detach: (() => void) | null = null;
	let wakeLock: ReturnType<typeof createWakeLock> | null = null;
	const AUTO_ACCEPT_S = 5;

	/** Phone landscape: no footer, the header holds Skip / Done / help. */
	let shortScreen = $state(false);
	onMount(() => {
		const q = matchMedia('(max-height: 500px)');
		const on = () => (shortScreen = q.matches);
		on();
		q.addEventListener('change', on);
		return () => q.removeEventListener('change', on);
	});

	onMount(async () => {
		wakeLock = createWakeLock();
		// The session in progress whatever day it started (a stale one is ended here).
		let local: LocalSession | null = activeSession() ?? storedSession();
		if (!local) {
			// Another device or cleared storage: resume the open session from the server.
			const stored = await getOptional<StoredSession | null>(fetch, '/api/session', null);
			local = stored && !stored.endedAt ? fromStored(stored) : null;
		}
		if (!local) {
			missing = true;
			return;
		}
		if (local.endedAt) {
			live.s = local;
			// Ended, but the summary never arrived (reloaded while it was on its way): ask again.
			if (!local.summary) await finish();
			else void loadGoals();
			return;
		}
		detach = live.attach(local, chime);
		if (local.phase === 'rate') enterRate();
		if (local.idx >= local.blocks.length) void finish();
	});

	onDestroy(() => {
		detach?.();
		clearInterval(autoTimer);
		wakeLock?.destroy();
		suspendKeys(false);
	});

	$effect(() => {
		wakeLock?.set(!!s && !s.endedAt);
	});
	// Child widgets' shortcuts are inert while a dialog is open.
	$effect(() => suspendKeys(confirmEnd || help));

	const block = $derived(s && s.idx < s.blocks.length ? s.blocks[s.idx] : null);
	const note = $derived<BlockNote | null>(s ? (s.notes[s.idx] ?? null) : null);
	const paused = $derived(!!s?.paused);
	const timeUp = $derived(!!s && s.phase === 'play' && (s.timeUp || live.remaining <= 0));
	const progress = $derived(live.total ? Math.min(1, live.elapsed / live.total) : 0);
	const isSong = $derived(block?.target.type === 'song');
	/** A tempo-ladder block: the ladder's own result rates it (no second rating step). */
	const isLadder = $derived.by(() => {
		const t = block?.target;
		if (t?.type === 'exercise') return true;
		if (t?.type !== 'lesson') return false;
		const l = data.index.lessons.find((x) => x.id === t.id);
		return !!l && lessonPractice(l).widget?.t === 'exercise';
	});
	const ladderRating = $derived(isLadder ? inferRating(note) : null);
	/** "Clean at BPM" where there is a tempo (exercises, songs, a lesson's ladder). */
	const hasTempo = $derived(
		block?.target.type === 'exercise' || isSong || (block?.target.type === 'lesson' && !!note?.bpm)
	);

	function pause() {
		live.update((x) => {
			x.paused = true;
			stopClock(x, Date.now());
		});
	}
	function resume() {
		live.update((x) => {
			x.paused = false;
			startClock(x, Date.now());
		});
	}
	function plusOne() {
		stopAuto();
		live.update((x) => {
			x.extraMin++;
			x.timeUp = false;
			x.phase = 'play';
			startClock(x, Date.now());
		});
	}

	function enterRate() {
		const r = inferRating(note);
		selected = r;
		suggested = !!r;
		bpm = note?.bpm ?? null;
		stopAuto();
		if (r) {
			autoLeft = AUTO_ACCEPT_S;
			autoTimer = setInterval(() => {
				if (autoLeft === null) return;
				autoLeft--;
				if (autoLeft <= 0) {
					stopAuto();
					rate(selected);
				}
			}, 1000);
		}
	}
	function stopAuto() {
		clearInterval(autoTimer);
		autoLeft = null;
	}

	function toRate() {
		if (!s || s.phase !== 'play') return;
		live.update((x) => {
			stopClock(x, Date.now());
			x.phase = 'rate';
		});
		// The ladder already said how it went: accept its rating and move on.
		if (ladderRating) {
			selected = ladderRating;
			bpm = note?.bpm ?? null;
			rate(ladderRating);
			return;
		}
		enterRate();
	}

	function record(result: BlockResult) {
		if (!s) return;
		const idx = s.idx;
		live.update((x) => (x.results[idx] = result));
		void api.block(s.id, idx, result);
	}

	function next() {
		stopAuto();
		bpm = null;
		selected = null;
		live.update((x) => {
			x.idx++;
			x.accMs = 0;
			x.since = null;
			x.extraMin = 0;
			x.timeUp = false;
			x.phase = 'play';
			startClock(x, Date.now());
		});
		if (s && s.idx >= s.blocks.length) void finish();
	}

	/** A lesson's progress, queued like the session writes when offline. */
	const lessonStatus = (id: string, status: 'started' | 'completed') =>
		void sendWrite(`/api/learn/lessons/${encodeURIComponent(id)}`, 'PUT', { status });
	// The new-skill block opens its lesson (as the lesson page does).
	$effect(() => {
		if (block?.target.type === 'lesson' && s?.phase === 'play')
			lessonStatus(block.target.id, 'started');
	});

	function rate(rating: Rating | null) {
		if (!s || s.phase !== 'rate') return;
		// A lesson practised and rated OK or better is done: the next session moves on.
		if (block?.target.type === 'lesson' && rating && rating !== 'hard')
			lessonStatus(block.target.id, 'completed');
		const max = isSong ? 150 : 300;
		record({
			actualSec: countedSec(s, Date.now()),
			rating,
			bpm: hasTempo && bpm && bpm >= 20 && bpm <= max ? Math.round(bpm) : null,
			completed: true,
			skipped: false
		});
		next();
	}

	function skip() {
		if (!s) return;
		live.update((x) => stopClock(x, Date.now()));
		record({
			actualSec: countedSec(s, Date.now()),
			rating: null,
			bpm: null,
			completed: false,
			skipped: true
		});
		next();
	}

	async function endEarly() {
		if (!s) return;
		confirmEnd = false;
		live.update((x) => stopClock(x, Date.now()));
		if (block && !s.results[s.idx] && live.elapsed >= 30_000)
			record({
				actualSec: countedSec(s, Date.now()),
				rating: null,
				bpm: null,
				completed: false,
				skipped: true
			});
		await finish();
	}

	function localSummary(x: LocalSession): SessionSummary {
		return {
			minutes: Math.round(x.results.reduce((a, r) => a + (r?.actualSec ?? 0), 0) / 60),
			blocksDone: x.results.filter((r) => r?.completed).length,
			blocksTotal: x.blocks.length,
			pbs: [],
			reviewed: []
		};
	}

	async function finish() {
		if (!s) return;
		stopAuto();
		live.update((x) => {
			stopClock(x, Date.now());
			x.endedAt ??= Date.now();
		});
		const id = s.id;
		const summary = await api.end(id, s.endedAt!);
		if (s?.id === id)
			live.update((x) => (x.summary = summary ?? localSummary($state.snapshot(x) as LocalSession)));
		void loadGoals();
	}

	async function loadGoals() {
		goals = await getOptional<Goals | null>(fetch, `/api/goals?date=${s?.date}`, null);
	}

	function onKey(e: KeyboardEvent) {
		if (e.code === 'Escape') {
			if (help) help = false;
			else if (confirmEnd) confirmEnd = false;
			return;
		}
		if (confirmEnd || help || !s || s.endedAt) return;
		if (e.repeat || focusOwnsKey(e) || e.ctrlKey || e.metaKey || e.altKey) return;
		if (s.phase === 'play' && RUNNER_DONE.includes(e.code) && !busy) {
			e.preventDefault();
			toRate();
		} else if (s.phase === 'rate' && RUNNER_ACCEPT.includes(e.code)) {
			e.preventDefault();
			rate(selected ?? 'ok');
		}
	}

	/** One line per block for the summary: what happened. */
	function recap(x: LocalSession, i: number): string {
		const r = x.results[i];
		const n = x.notes[i];
		if (!r) return 'not played';
		if (r.skipped) return 'skipped';
		const parts: string[] = [];
		if (n?.changes !== undefined) parts.push(`${n.changes} changes`);
		if (r.bpm)
			parts.push(x.blocks[i].target.type === 'song' ? `clean at ${r.bpm}%` : `${r.bpm} BPM clean`);
		if (r.rating) parts.push(`${RATING_EMOJI[r.rating]} ${RATING_LABEL[r.rating]}`);
		return parts.join(' · ') || 'done';
	}
</script>

<svelte:head><title>{block ? `${block.title} · ` : ''}Session · Self-Guitar</title></svelte:head>
<svelte:window onkeydown={onKey} />

{#snippet helpButton(extra: string)}
	<button
		class="btn shrink-0 bg-transparent! px-2 {extra}"
		aria-label="Keys and pedal"
		aria-expanded={help}
		onclick={() => (help = !help)}
		data-testid="runner-help-open"><Icon name="keys" /></button
	>
{/snippet}

{#if missing}
	<main
		class="mx-auto flex h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center"
	>
		<p class="text-xl font-semibold">No session in progress</p>
		<p class="text-muted">Start one from Today: pick a length and tap Start.</p>
		<a href="{base}/" class="btn btn-primary min-h-12 px-6">Go to Today</a>
	</main>
{:else if s?.summary}
	{@const sum = s.summary}
	{@const allPlayed = s.results.every((r) => r?.completed)}
	<main
		class="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-8"
		data-testid="session-summary"
	>
		<header
			class="flex flex-col items-center gap-2 pt-4 text-center short:flex-row short:pt-0 short:text-left"
		>
			<span class="rounded-full bg-ok p-3 text-ok-fg"><Icon name="check" size={32} /></span>
			<div>
				<h1 class="text-2xl font-bold">Session done</h1>
				<p class="text-muted">
					{allPlayed ? 'Every block played. ' : ''}Nice work — see you next time.
				</p>
			</div>
		</header>
		<dl class="grid {sum.pbs.length ? 'grid-cols-3' : 'grid-cols-2'} gap-2 text-center">
			<div class="card p-3">
				<dt class="text-xs text-muted">Minutes</dt>
				<dd class="text-3xl font-bold tabular-nums" data-testid="summary-minutes">{sum.minutes}</dd>
			</div>
			<div class="card p-3">
				<dt class="text-xs text-muted">Blocks</dt>
				<dd class="text-3xl font-bold tabular-nums" data-testid="summary-blocks">
					{sum.blocksDone}<span class="text-lg text-muted">/{sum.blocksTotal}</span>
				</dd>
			</div>
			{#if sum.pbs.length}
				<div class="card p-3">
					<dt class="text-xs text-muted">New bests</dt>
					<dd class="text-3xl font-bold tabular-nums">{sum.pbs.length}</dd>
				</div>
			{/if}
		</dl>
		<section class="card">
			<h2 class="mb-2 font-semibold">What you practised</h2>
			<ol class="flex flex-col divide-y divide-line" data-testid="summary-recap">
				{#each s.blocks as b, i (i)}
					<li class="flex items-baseline justify-between gap-3 py-1.5">
						<span class="min-w-0">
							<span class="block text-xs text-muted">{KIND[b.kind].label}</span>
							<span class="font-medium">{b.title}</span>
						</span>
						<span class="shrink-0 text-right text-sm text-muted tabular-nums">{recap(s, i)}</span>
					</li>
				{/each}
			</ol>
		</section>
		{#if sum.pbs.length}
			<section class="card">
				<h2 class="mb-2 flex items-center gap-2 font-semibold">
					<Icon name="star" size={18} />Personal bests
				</h2>
				<ul class="flex flex-col gap-1" data-testid="summary-pbs">
					{#each sum.pbs as pb (pb.label)}
						<li class="flex justify-between gap-2">
							<span>{pb.label}</span><b class="tabular-nums">{pb.value}</b>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
		{#if sum.reviewed.length}
			<section class="card">
				<h2 class="mb-2 flex items-center gap-2 font-semibold">
					<Icon name="loop" size={18} />Next reviews
				</h2>
				<ul class="flex flex-col gap-1" data-testid="summary-reviewed">
					{#each sum.reviewed as r (r.skillId)}
						<li class="flex justify-between gap-2">
							<span>{r.name}</span>
							<span class="text-muted">{r.lapsed ? 'again ' : ''}{dueIn(r.dueAt)}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
		{#if sum.tomorrow}
			<p class="rounded-2xl bg-surface-2 px-4 py-3" data-testid="summary-tomorrow">
				<b>Tomorrow:</b>
				{[
					sum.tomorrow.due
						? `${sum.tomorrow.due} ${sum.tomorrow.due === 1 ? 'skill' : 'skills'} to review`
						: '',
					sum.tomorrow.next ? `next up “${sum.tomorrow.next}”` : 'songs and polish'
				]
					.filter(Boolean)
					.join(' · ')}
			</p>
		{/if}
		{#if goals}
			<section class="card">
				<h2 class="mb-2 font-semibold">This week</h2>
				<WeekDays {goals} />
			</section>
		{/if}
		<div class="mt-auto flex gap-2 pt-2">
			<a href="{base}/progress" class="btn min-h-14 flex-1">Progress</a>
			<button
				class="btn btn-primary min-h-14 flex-[2] text-lg"
				onclick={() => goto(`${base}/`)}
				data-testid="summary-done">Done</button
			>
		</div>
	</main>
{:else if s && block}
	<div
		class="flex h-dvh flex-col"
		data-testid="session-runner"
		data-idx={s.idx}
		data-phase={s.phase}
		data-time-up={timeUp}
	>
		<!-- Top: end, the block's title and its clock (readable from the stand); under it the
		     blocks (widths by minutes; the current one fills with its time); then what to do. -->
		<header
			class="border-b border-line bg-surface px-1 pt-[max(0.125rem,env(safe-area-inset-top))] pb-1.5"
		>
			<div class="flex items-center gap-1">
				<button
					class="btn shrink-0 bg-transparent! px-2"
					aria-label="End session"
					onclick={() => (confirmEnd = true)}
					data-testid="end-session"><Icon name="close" /></button
				>
				<h1
					class="line-clamp-2 min-w-0 flex-1 text-base leading-tight font-bold"
					data-testid="block-title"
					title={block.title}
				>
					{block.title}
				</h1>
				<span
					class="shrink-0 px-1 text-3xl leading-none font-bold tabular-nums {timeUp
						? 'text-accent'
						: ''} {paused && s.phase === 'play' ? 'opacity-50' : ''}"
					role="timer"
					aria-label="{clock(live.remaining)} left in this block"
					data-testid="block-timer">{clock(live.remaining)}</span
				>
				{#if s.phase === 'play'}
					<button
						class="btn shrink-0 px-2"
						aria-label={paused ? 'Resume timer' : 'Pause timer'}
						onclick={paused ? resume : pause}
						data-testid="timer-toggle"><Icon name={paused ? 'play' : 'pause'} /></button
					>
				{/if}
				<button
					class="btn shrink-0 px-2 font-semibold"
					onclick={plusOne}
					data-testid="plus-one"
					aria-label="Add one minute">+1</button
				>
				{#if s.phase === 'play'}
					<!-- Phone landscape: Skip / Done live up here (no footer). -->
					<button class="btn hidden short:inline-flex" onclick={skip} aria-label="Skip block"
						><Icon name="skip" size={18} /></button
					>
					<button
						class="btn btn-primary hidden short:inline-flex"
						onclick={toRate}
						data-testid="block-done-short"><Icon name="check" size={18} />Done</button
					>
				{/if}
				{#if shortScreen}{@render helpButton('')}{/if}
			</div>
			<div class="flex items-center gap-2 px-2 pt-0.5">
				<ol
					class="flex min-w-0 flex-1 gap-1"
					aria-label="Block {s.idx + 1} of {s.blocks.length}"
					data-testid="session-progress"
				>
					{#each s.blocks as b, i (i)}
						<li
							class="relative h-1.5 min-w-2 overflow-hidden rounded-full {i < s.idx
								? s.results[i]?.completed
									? 'bg-accent'
									: 'bg-muted'
								: i === s.idx
									? 'bg-surface-2 ring-1 ring-fg/60'
									: 'border border-muted'}"
							style:flex-grow={b.minutes}
							style:flex-basis="0"
							title="{KIND[b.kind].label}: {b.title} · {b.minutes} min"
						>
							{#if i === s.idx}
								<div
									class="absolute inset-y-0 left-0 {timeUp ? 'bg-ok' : 'bg-fg'}"
									style:width="{progress * 100}%"
									role="progressbar"
									aria-label="Block time"
									aria-valuemin={0}
									aria-valuemax={100}
									aria-valuenow={Math.round(progress * 100)}
								></div>
							{/if}
						</li>
					{/each}
				</ol>
				<p class="shrink-0 text-[11px] font-medium tracking-wide text-muted uppercase">
					{KIND[block.kind].label} · {s.idx + 1}/{s.blocks.length} · {block.minutes + s.extraMin} min
				</p>
			</div>
		</header>
		{#if !isLadder && s.phase === 'play'}
			<!-- What to do with your hands, in at most two lines, full width. -->
			<p
				class="line-clamp-2 px-3 pt-1.5 text-[15px] leading-snug font-medium short:line-clamp-1 short:pt-1 short:text-sm"
				data-testid="block-do"
			>
				{whatToDo(block, data.index)}
			</p>
		{/if}

		{#if timeUp}
			<!-- Soft: the block stays on screen (a pass, a round or the song keeps going). -->
			<div
				class="mx-3 mt-1.5 flex items-center gap-2 rounded-2xl bg-accent px-3 py-1 text-accent-fg"
				role="status"
				data-testid="time-up"
			>
				<Icon name="timer" />
				<p class="min-w-0 flex-1 leading-tight font-semibold">
					Time’s up <span class="font-normal">· finish, then Done</span>
				</p>
				<button class="btn min-h-10 bg-surface! text-fg!" onclick={plusOne}>+1 min</button>
			</div>
		{/if}

		<div class="mt-1 flex min-h-0 flex-1 flex-col">
			{#if s.phase === 'play'}
				{#key s.idx}
					<BlockSurface
						{block}
						index={data.index}
						onnote={(n) => live.update((x) => (x.notes[x.idx] = { ...x.notes[x.idx], ...n }))}
						onbusy={(b) => (busy = b)}
						onchangesdone={toRate}
					/>
				{/key}
			{:else}
				<!-- Rating step. -->
				<section
					class="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-4 overflow-y-auto p-4 short:gap-2 short:py-2"
					data-testid="rating"
					data-selected={selected}
					role="group"
					aria-label="Rate the block"
					onpointerdown={stopAuto}
					onfocusin={stopAuto}
				>
					<h2 class="text-center text-xl font-semibold short:text-lg">How did it go?</h2>
					{#if suggested && selected}
						<p class="text-center text-sm text-muted" data-testid="rating-suggested">
							Suggested from {note?.changes !== undefined ? 'your count' : 'your ladder'}: {RATING_EMOJI[
								selected
							]}
							{RATING_LABEL[selected]}{#if autoLeft !== null}<span data-testid="rating-countdown"
									>{` · saving in ${autoLeft} s`}</span
								>{/if}
						</p>
					{/if}
					<div class="grid grid-cols-3 gap-2">
						{#each RATINGS as r (r)}
							<button
								class="btn min-h-24 flex-col gap-1 rounded-2xl border-2 text-base short:min-h-16 {selected ===
								r
									? 'border-accent ring-2 ring-accent'
									: 'border-line'}"
								aria-pressed={selected === r}
								onclick={() => rate(r)}
								data-testid="rate-{r}"
							>
								<span class="text-4xl leading-none short:text-3xl" aria-hidden="true"
									>{RATING_EMOJI[r]}</span
								>
								{RATING_LABEL[r]}
							</button>
						{/each}
					</div>
					{#if hasTempo}
						<label class="flex flex-wrap items-center justify-center gap-2 text-sm">
							<span class="text-muted">{isSong ? 'Played cleanly at' : 'Clean at'}</span>
							<input
								type="number"
								inputmode="numeric"
								min={isSong ? 25 : 20}
								max={isSong ? 150 : 300}
								placeholder="—"
								bind:value={bpm}
								class="field w-24 text-center text-lg font-semibold tabular-nums"
								data-testid="rating-bpm"
							/>
							<span class="text-muted">{isSong ? '% speed' : 'BPM'} (optional)</span>
						</label>
					{/if}
					<p class="hidden text-center text-xs text-muted kbd:block">
						→ / PageDown / Enter: {selected ? 'save the highlighted rating' : 'OK'}
					</p>
					<div class="flex justify-center gap-2">
						<button class="btn bg-transparent! text-muted" onclick={plusOne}
							>Keep going (+1 min)</button
						>
						<button
							class="btn bg-transparent! text-muted"
							onclick={() => rate(null)}
							data-testid="rate-skip">No rating</button
						>
					</div>
				</section>
			{/if}
		</div>

		{#if s.phase === 'play'}
			<footer
				class="flex gap-2 border-t border-line bg-surface px-2 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] short:hidden"
			>
				{#if !shortScreen}{@render helpButton('min-h-12')}{/if}
				<button class="btn min-h-12 flex-1" onclick={skip} data-testid="skip-block"
					><Icon name="skip" size={18} />Skip</button
				>
				<button
					class="btn btn-primary min-h-12 flex-[2] text-base"
					onclick={toRate}
					data-testid="block-done"
					><Icon name="check" />{ladderRating
						? `Done · ${RATING_EMOJI[ladderRating]} ${RATING_LABEL[ladderRating]}`
						: isLadder
							? 'Done'
							: `Done${s.idx + 1 < s.blocks.length ? ' · rate it' : ''}`}</button
				>
			</footer>
		{/if}
	</div>

	{#if help}
		<div
			class="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center"
			role="dialog"
			aria-modal="true"
			aria-labelledby="help-title"
			data-testid="runner-help"
		>
			<div class="card flex w-full max-w-sm flex-col gap-3">
				<h2 id="help-title" class="text-lg font-semibold">Keys and pedal</h2>
				<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
					<dt class="font-semibold">PageDown / Enter</dt>
					<dd>Done with this block</dd>
					<dt class="font-semibold">→ / PageDown</dt>
					<dd>On the rating: save the highlighted one (🙂 OK if none)</dd>
					<dt class="font-semibold">Space / →</dt>
					<dd>Ladder: clean pass</dd>
					<dt class="font-semibold">← / Backspace</dt>
					<dd>Ladder: miss</dd>
					<dt class="font-semibold">P</dt>
					<dd>Ladder: play / pause</dd>
					<dt class="font-semibold">Esc</dt>
					<dd>Close a dialog</dd>
				</dl>
				<p class="text-sm text-muted">
					A page-turner pedal sending PageDown / → runs a whole session hands-free. A suggested
					rating saves itself after {AUTO_ACCEPT_S} seconds.
				</p>
				<button class="btn min-h-12" onclick={() => (help = false)}>Close</button>
			</div>
		</div>
	{/if}

	{#if confirmEnd}
		<div
			class="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center"
			role="dialog"
			aria-modal="true"
			aria-labelledby="end-title"
		>
			<div class="card flex w-full max-w-sm flex-col gap-3">
				<h2 id="end-title" class="text-lg font-semibold">End the session here?</h2>
				<p class="text-sm text-muted">What you played so far counts toward this week.</p>
				<div class="flex gap-2">
					<button class="btn min-h-12 flex-1" onclick={() => (confirmEnd = false)}
						>Keep playing</button
					>
					<button
						class="btn btn-primary min-h-12 flex-1"
						onclick={endEarly}
						data-testid="confirm-end">End session</button
					>
				</div>
			</div>
		</div>
	{/if}
{:else if s}
	<main class="flex h-dvh items-center justify-center text-muted">Wrapping up…</main>
{/if}
