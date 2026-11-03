<script lang="ts">
	// One round of 1-minute changes: count-in, 60 s (count in your head or tap), then enter and
	// save the total. Starts when mounted (mount it from a tap: audio is unlocked there). Used by
	// the changes tool (full screen) and by session blocks (inline).
	import { onDestroy, onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import ChordDiagram from '$lib/chords/ChordDiagram.svelte';
	import type { Voicing } from '$lib/chords/model';
	import { getAudioContext } from '$lib/audio/context';
	import { playClick } from '$lib/metronome/scheduler';
	import { MAX_CHANGES, type ChangePair } from '$lib/chordChanges';
	import { createWakeLock } from '$lib/player/wakeLock';
	import { keysSuspended, PEDAL_NEXT } from '$lib/keys';
	import { saveChanges } from './client';

	const DURATION_S = 60;
	const COUNT_IN = 3;

	let {
		a,
		b,
		voicingA,
		voicingB,
		tapMode,
		best = null,
		onsaved,
		oncancel
	}: {
		a: string;
		b: string;
		voicingA: Voicing;
		voicingB: Voicing;
		tapMode: boolean;
		/** Personal best so far (shown when entering the count). */
		best?: number | null;
		onsaved: (pair: ChangePair, count: number) => void;
		oncancel: () => void;
	} = $props();

	type Phase = 'countin' | 'running' | 'done';
	let phase = $state<Phase>('countin');
	let countIn = $state(COUNT_IN);
	let remaining = $state(DURATION_S);
	let count = $state(0);
	let saving = $state(false);
	let saveError = $state('');

	let startAt = 0;
	let timer: ReturnType<typeof setInterval> | undefined;
	let wakeLock: ReturnType<typeof createWakeLock> | null = null;

	onMount(() => {
		wakeLock = createWakeLock();
		wakeLock.set(true);
		startAt = performance.now();
		beep('beat');
		timer = setInterval(tick, 50);
	});

	onDestroy(() => {
		clearInterval(timer);
		wakeLock?.destroy();
	});

	function beep(level: 'accent' | 'beat') {
		const ctx = getAudioContext();
		playClick(ctx, ctx.currentTime + 0.01, level);
	}

	function tick() {
		const elapsed = (performance.now() - startAt) / 1000;
		if (phase === 'countin') {
			const left = COUNT_IN - Math.floor(elapsed);
			if (left <= 0) {
				phase = 'running';
				startAt += COUNT_IN * 1000;
				remaining = DURATION_S;
				beep('accent');
			} else if (left !== countIn) {
				countIn = left;
				beep('beat');
			}
		} else if (phase === 'running') {
			remaining = Math.max(0, DURATION_S - elapsed);
			if (remaining <= 0) finish();
		}
	}

	function finish() {
		clearInterval(timer);
		phase = 'done';
		wakeLock?.set(false);
		beep('accent');
		navigator.vibrate?.([80, 60, 80]);
	}

	function cancel() {
		clearInterval(timer);
		wakeLock?.set(false);
		oncancel();
	}

	function hit(e?: Event) {
		e?.preventDefault();
		if (phase === 'running') count = Math.min(MAX_CHANGES, count + 1);
	}

	async function save() {
		saving = true;
		saveError = '';
		try {
			onsaved(await saveChanges(a, b, count), count);
		} catch (e) {
			saveError = (e as Error).message;
		} finally {
			saving = false;
		}
	}

	function onKey(e: KeyboardEvent) {
		if (keysSuspended()) return;
		if (phase === 'running' && tapMode && PEDAL_NEXT.includes(e.code)) hit(e);
		if (e.code === 'Escape' && phase !== 'done') cancel();
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="flex min-h-0 flex-1 flex-col" data-testid="changes-session" data-phase={phase}>
	<div class="mb-2 flex items-center gap-2">
		<span class="flex-1 text-lg font-semibold">{a} ⇄ {b}</span>
		{#if phase !== 'done'}
			<button class="btn" onclick={cancel} aria-label="Cancel"><Icon name="close" /></button>
		{/if}
	</div>
	<div class="flex min-h-0 flex-1 flex-col gap-4 short:flex-row short:items-stretch">
		<div
			class="mx-auto grid w-full max-w-md grid-cols-2 gap-4 lg:max-w-xl short:mx-0 short:w-80 short:shrink-0 short:self-center short:gap-2"
		>
			<div data-testid="session-a" data-voicing={voicingA.id}>
				<p class="text-center text-3xl font-bold short:text-2xl">{a}</p>
				<ChordDiagram voicing={voicingA} label="{a} diagram" />
			</div>
			<div>
				<p class="text-center text-3xl font-bold short:text-2xl">{b}</p>
				<ChordDiagram voicing={voicingB} label="{b} diagram" />
			</div>
		</div>

		{#if phase === 'done'}
			<div
				class="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 text-center short:gap-2"
			>
				<p class="text-xl font-semibold">Time! How many changes?</p>
				<div class="flex items-center gap-4">
					<button
						class="btn size-16 rounded-2xl"
						aria-label="One less"
						onclick={() => (count = Math.max(0, count - 1))}><Icon name="minus" size={28} /></button
					>
					<input
						type="number"
						inputmode="numeric"
						min="0"
						max={MAX_CHANGES}
						bind:value={count}
						onfocus={(e) => e.currentTarget.select()}
						class="field h-20 w-32 text-center text-5xl font-bold tabular-nums"
						aria-label="Number of changes"
						data-testid="changes-count-input"
					/>
					<button
						class="btn size-16 rounded-2xl"
						aria-label="One more"
						onclick={() => (count = Math.min(MAX_CHANGES, count + 1))}
						><Icon name="plus" size={28} /></button
					>
				</div>
				<p class="text-sm text-muted">
					{tapMode ? 'Adjust if you missed taps' : 'Type the number you counted'}{best
						? ` · best so far ${best}`
						: ''}.
				</p>
				{#if saveError}<p class="text-danger" role="alert">{saveError}</p>{/if}
				<div class="mt-auto flex w-full gap-2">
					<button class="btn min-h-14 flex-1" onclick={cancel}>Discard</button>
					<button
						class="btn btn-primary min-h-14 flex-[2] text-lg"
						onclick={save}
						disabled={saving || !Number.isInteger(count) || count < 0 || count > MAX_CHANGES}
						data-testid="changes-save">Save result</button
					>
				</div>
			</div>
		{:else}
			<button
				class="flex min-h-48 flex-1 touch-manipulation flex-col items-center justify-center rounded-3xl border-2 border-line bg-surface select-none {tapMode
					? 'border-dashed active:bg-surface-2'
					: 'cursor-default'}"
				onpointerdown={tapMode ? hit : undefined}
				onclick={(e) => tapMode && e.detail === 0 && hit()}
				disabled={phase !== 'running' || !tapMode}
				data-testid="changes-tap"
				aria-label={tapMode ? 'Tap for each change' : 'Time left'}
			>
				{#if phase === 'countin'}
					<span
						class="text-9xl font-bold text-accent tabular-nums short:text-8xl"
						data-testid="countin">{countIn}</span
					>
					<span class="text-muted">Get ready on {a}</span>
				{:else if tapMode}
					<span
						class="text-2xl font-semibold text-muted tabular-nums"
						data-testid="changes-remaining">{Math.ceil(remaining)} s left</span
					>
					<span class="text-9xl font-bold tabular-nums short:text-8xl" data-testid="changes-count"
						>{count}</span
					>
					<span class="text-muted">tap per change</span>
				{:else}
					<span
						class="text-9xl font-bold tabular-nums short:text-8xl"
						data-testid="changes-remaining">{Math.ceil(remaining)}</span
					>
					<span class="text-xl text-muted">seconds left · keep counting</span>
				{/if}
				<span class="mt-6 h-2 w-3/4 overflow-hidden rounded-full bg-surface-2 short:mt-3">
					<span
						class="block h-full bg-accent"
						style="width: {phase === 'running' ? (remaining / DURATION_S) * 100 : 100}%"
					></span>
				</span>
			</button>
		{/if}
	</div>
</div>
