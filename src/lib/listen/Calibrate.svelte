<script lang="ts">
	// The mic timing test: the player's clicks (alphaTab's metronome, the sound path the note check
	// scores), and the learner plucks a muted string with each (or taps, or lets the mic hear the
	// speaker). The delay found is stored for this device and output. Used by /tools/calibrate and,
	// the first time, by the Mic check on the tempo ladder (in a sheet).
	import { onDestroy, onMount } from 'svelte';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import { MIC_HELP, type MicProblem } from '$lib/tuner/mic';
	import { CalPlayer, LEAD_CLICKS } from './calplayer';
	import {
		CAL_CLICKS,
		loadLatency,
		offsetsToClicks,
		robustOffset,
		saveLatency,
		type CalMode,
		type StoredLatency
	} from './latency';
	import { MicOnsets } from './mic';

	let {
		compact = false,
		ondone
	}: {
		compact?: boolean;
		/** A value was measured and saved. */
		ondone?: (v: StoredLatency) => void;
	} = $props();

	const MODES: { id: CalMode; label: string; icon: IconName; hint: string }[] = [
		{
			id: 'pluck',
			label: 'Pluck along',
			icon: 'mic',
			hint: 'Rest your fretting hand on the strings and pluck with each click.'
		},
		{ id: 'tap', label: 'Tap along', icon: 'tap', hint: 'Tap the pad with each click.' },
		{
			id: 'loopback',
			label: 'Speaker test',
			icon: 'volume',
			hint: 'Speaker up, no headphones: the mic hears the clicks by itself.'
		}
	];

	let mode = $state<CalMode>('pluck');
	let status = $state<'loading' | 'idle' | 'running' | 'done' | 'failed' | 'error'>('loading');
	let problem = $state<MicProblem | null>(null);
	let stored = $state<StoredLatency | null>(null);
	let result = $state<{ ms: number; spread: number; kept: number } | null>(null);
	/** Measured clicks played so far (0..8), for the dots. */
	let played = $state(0);
	let heard = $state(0);
	let more = $state(false);
	/** First measured click, ms after the mic stream arrived (end-to-end tests compare with it). */
	let firstClick = $state<number | null>(null);

	let host: HTMLDivElement;
	let player: CalPlayer | null = null;
	let mic: MicOnsets | null = null;
	let micReadyAt = 0;
	let events: number[] = []; // performance.now() ms: onsets or taps
	let token = 0;

	onMount(async () => {
		try {
			const m = localStorage.getItem('listen.calMode');
			if (MODES.some((x) => x.id === m)) mode = m as CalMode;
		} catch {
			// default mode
		}
		if (mode !== 'pluck') more = true;
		player = new CalPlayer(host, {
			beat: (i) => {
				if (status === 'running') played = Math.max(0, Math.min(CAL_CLICKS, i - LEAD_CLICKS + 1));
			},
			finished: () => void finish(token)
		});
		stored = await loadLatency();
		await player.ready;
		if (status === 'loading') status = 'idle';
	});
	onDestroy(() => {
		cancel();
		player?.destroy();
	});

	function cancel() {
		token++;
		player?.stop();
		mic?.stop();
		mic = null;
	}

	function start() {
		if (status === 'loading' || !player) return;
		cancel();
		const my = token;
		problem = null;
		result = null;
		firstClick = null;
		micReadyAt = 0;
		played = heard = 0;
		events = [];
		status = 'running';
		// Inside the tap (iOS): the clicks start now, the mic opens alongside (two lead clicks
		// give it time).
		if (mode !== 'tap') {
			const m = new MicOnsets(
				{
					onset: (o) => {
						events.push(o.perf);
						heard++;
					},
					problem: (p) => fail(p)
				},
				'onsets',
				'calibrate'
			);
			mic = m;
			void m.start().then((p) => {
				if (my !== token) return;
				if (p) return fail(p);
				micReadyAt = m.openedAt;
			});
		}
		player.play();
		// In case the end of the clicks is never reported (10 beats at 80 BPM: 7.5 s).
		setTimeout(() => void finish(my), 10_000);
	}

	function tap(e: PointerEvent) {
		if (status !== 'running' || mode !== 'tap') return;
		events.push(e.timeStamp);
		heard++;
		navigator.vibrate?.(5);
	}

	async function finish(my: number) {
		if (my !== token || status !== 'running') return;
		// The last onsets are still on their way from the worklet.
		await new Promise((r) => setTimeout(r, 300));
		if (my !== token) return;
		mic?.stop();
		mic = null;
		const clicks = player?.clicks() ?? null;
		if (clicks && micReadyAt) firstClick = Math.round(clicks[0] - micReadyAt);
		const est = clicks ? robustOffset(offsetsToClicks(events, clicks)) : null;
		if (!est) {
			status = 'failed';
			return;
		}
		result = { ms: est.ms, spread: est.spread, kept: est.kept };
		const v: StoredLatency = { ms: est.ms, spread: est.spread, mode, at: new Date().toISOString() };
		await saveLatency(v);
		stored = v;
		status = 'done';
		ondone?.(v);
	}

	function fail(p: MicProblem) {
		cancel();
		problem = p;
		status = 'error';
	}

	function pick(id: CalMode) {
		mode = id;
		try {
			localStorage.setItem('listen.calMode', id);
		} catch {
			// not remembered
		}
		if (status !== 'running' && status !== 'loading') status = 'idle';
	}

	const current = $derived(MODES.find((m) => m.id === mode)!);
	/** One plain verdict on a measurement: how steady the clicks were. */
	const verdict = (r: { ms: number; spread: number }) =>
		r.spread <= 20
			? `Good: ${r.ms} ms measured`
			: r.spread <= 40
				? `OK: ${r.ms} ms measured (a little uneven)`
				: `Uneven: ${r.ms} ms measured, try again`;
</script>

<section
	class="flex flex-col gap-3 {compact ? '' : 'flex-1'}"
	data-testid="calibrate"
	data-status={status}
	data-latency={result?.ms ?? stored?.ms ?? ''}
	data-first-click={firstClick ?? undefined}
>
	{#if !compact}
		<div class="text-sm text-muted">
			<p>
				Your phone hears you a little after you play: the sound has to travel out of the speaker and
				back through the mic. This test measures that delay once, so the Mic check never calls you
				late when you were on time.
			</p>
		</div>
	{/if}

	<p class="flex items-center gap-2 font-semibold" data-testid="cal-mode-label">
		<Icon name={current.icon} size={20} />{current.label}
		{#if mode === 'pluck'}<span class="chip text-xs font-normal">Recommended</span>{/if}
	</p>

	<!-- The pad: the clicks as dots; in tap mode the whole pad takes the taps. -->
	<button
		class="card flex flex-col items-center justify-center gap-3 select-none {compact
			? 'min-h-44'
			: 'max-h-[26rem] min-h-64 flex-1 short:min-h-44'} {status === 'running' && mode === 'tap'
			? 'active:bg-surface-2'
			: ''} {status === 'error' ? 'border-danger!' : status === 'done' ? 'border-ok!' : ''}"
		onpointerdown={tap}
		onclick={() => status !== 'running' && start()}
		disabled={status === 'loading'}
		aria-label={status === 'running'
			? mode === 'tap'
				? 'Tap with each click'
				: 'Listening'
			: status === 'done'
				? 'Test again'
				: 'Start'}
		data-testid="cal-pad"
	>
		{#if status === 'error' && problem}
			<span class="text-danger"><Icon name="alert" size={36} /></span>
			<span class="text-lg font-semibold" data-testid="mic-problem" data-problem={problem}
				>{MIC_HELP[problem].title}</span
			>
			<span class="px-2 text-sm text-muted">{MIC_HELP[problem].body}</span>
		{:else if status === 'done' && result}
			<span class="text-sm text-muted">Delay</span>
			<span class="text-5xl font-bold tabular-nums" data-testid="cal-result"
				>{result.ms}<span class="text-xl font-medium text-muted"> ms</span></span
			>
			<span
				class="font-semibold {result.spread <= 40 ? 'text-ok' : 'text-warn'}"
				data-testid="cal-verdict">{verdict(result)}</span
			>
			<span class="text-sm text-muted">Saved for this device. Tap to test again.</span>
		{:else if status === 'failed'}
			<span class="text-warn"><Icon name="alert" size={36} /></span>
			<span class="text-lg font-semibold" data-testid="cal-failed">Couldn't measure that</span>
			<span class="text-sm text-muted">{heard} heard. Try again and play on every click.</span>
		{:else}
			<span class="flex gap-2" aria-hidden="true">
				{#each Array.from({ length: CAL_CLICKS }, (_, i) => i) as i (i)}
					<span
						class="size-4 rounded-full border-2 {i < played
							? 'border-accent bg-accent'
							: 'border-line'}"
					></span>
				{/each}
			</span>
			{#if status === 'running'}
				<span class="text-lg font-semibold">{current.hint}</span>
				<span class="text-sm text-muted tabular-nums" data-testid="cal-heard">{heard} heard</span>
			{:else if status === 'loading'}
				<span class="text-lg font-semibold">Loading the clicks…</span>
			{:else}
				<span class="flex items-center gap-2 text-xl font-semibold"
					><Icon name="play" size={24} />Start</span
				>
				<span class="px-2 text-sm text-muted"
					>Two clicks to get ready, then eight to play along.</span
				>
				<span class="px-2 text-sm text-muted">{current.hint}</span>
			{/if}
		{/if}
	</button>

	<div class="flex flex-wrap items-center justify-between gap-2 text-sm text-muted tabular-nums">
		<span data-testid="cal-stored">{stored ? `Saved: ${stored.ms} ms` : 'Not measured yet'}</span>
		{#if status === 'done' || status === 'failed' || status === 'error'}
			<button class="btn whitespace-nowrap" onclick={start} data-testid="cal-retest"
				><Icon name="loop" size={18} />Test again</button
			>
		{/if}
	</div>

	<details class="text-sm" bind:open={more} data-testid="cal-more">
		<summary class="cursor-pointer text-muted">More ways to measure</summary>
		<div class="mt-2 flex flex-col gap-2">
			{#each MODES as m (m.id)}
				<button
					class="btn justify-start text-left"
					aria-pressed={mode === m.id}
					disabled={status === 'running'}
					onclick={() => pick(m.id)}
					data-testid="cal-mode-{m.id}"
					><Icon name={m.icon} size={18} /><span
						><b>{m.label}</b><span class="block text-xs opacity-75">{m.hint}</span></span
					></button
				>
			{/each}
		</div>
	</details>

	<!-- The click player (alphaTab), out of sight. -->
	<div
		class="pointer-events-none absolute -left-[9999px] h-px w-80 overflow-hidden opacity-0"
		aria-hidden="true"
		bind:this={host}
	></div>
</section>
