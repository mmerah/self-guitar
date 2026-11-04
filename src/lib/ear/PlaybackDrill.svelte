<script lang="ts">
	// "Play it back": the app plays a note, you find it on the guitar; the tuner's pitch detection
	// hears when you have it (any octave), and the next note comes about a second later. "Show me"
	// reveals where it is in first position (and counts as a miss).
	import { onDestroy } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Fretboard from '$lib/fretboard/Fretboard.svelte';
	import { overlay } from '$lib/theory/fretboard';
	import { MIC_HELP, type MicProblem } from '$lib/tuner/mic';
	import { PitchListener } from '$lib/tuner/listen';
	import { loadEar, saveEarAnswer } from './client';
	import { EAR_ITEMS } from './items';
	import { playbackNote } from './questions';
	import { playNotes, stopEar } from './sound';
	import { itemStats, type ItemStats } from './trainer';

	let {
		fixed = null,
		onstats
	}: {
		/** Always this note (tests, a lesson on one note). */
		fixed?: string | null;
		onstats?: (s: ItemStats) => void;
	} = $props();

	/** The right note held this long counts. */
	const HOLD_MS = 300;
	let target = $state<{ item: string; midi: number } | null>(null);
	let status = $state<'idle' | 'listening' | 'right' | 'shown'>('idle');
	let heard = $state<string | null>(null);
	let problem = $state<MicProblem | null>(null);
	let score = $state({ right: 0, total: 0 });
	let since = 0;
	/** After a right note: the next one plays by itself this long after. */
	const ADVANCE_MS = 1000;
	let advance: ReturnType<typeof setTimeout> | undefined;

	const listener = new PitchListener((n) => {
		if (!target || status !== 'listening') return;
		heard = n ? n.name : heard;
		const ok = !!n && n.name === target.item && Math.abs(n.cents) < 40;
		if (!ok) since = 0;
		else if (!since) since = performance.now();
		else if (performance.now() - since >= HOLD_MS) finish(true);
	});

	function newNote() {
		clearTimeout(advance);
		const items = EAR_ITEMS.playback.map((i) => i.id);
		const item = fixed ?? items[Math.floor(Math.random() * items.length)];
		target = { item, midi: playbackNote(item, Math.random) };
		heard = null;
		since = 0;
		status = 'listening';
		playNotes([target.midi]);
		if (!problem) listener.start().then((p) => (problem = p));
	}

	function finish(right: boolean) {
		if (!target) return;
		status = right ? 'right' : 'shown';
		score = { right: score.right + (right ? 1 : 0), total: score.total + 1 };
		if (right) {
			navigator.vibrate?.(25);
			advance = setTimeout(newNote, ADVANCE_MS);
		}
		saveEarAnswer('playback', target.item, right ? target.item : '').then(
			(s) => s && onstats?.(itemStats(s.history))
		);
	}

	$effect(() => {
		let stale = false;
		loadEar('playback').then((s) => !stale && onstats?.(itemStats(s.history)));
		return () => {
			stale = true;
		};
	});

	onDestroy(() => {
		clearTimeout(advance);
		listener.stop();
		stopEar();
	});

	const where = $derived(
		target ? overlay({ mode: 'note', note: target.item, frets: [0, 4], labels: 'notes' }) : null
	);
</script>

<div
	class="flex flex-col gap-2.5"
	data-testid="ear-playback"
	data-status={status}
	data-item={target?.item ?? ''}
>
	{#if status === 'idle'}
		<button class="btn btn-primary min-h-16 text-lg" onclick={newNote} data-testid="playback-start"
			><Icon name="play" size={26} />Play a note</button
		>
		<p class="text-center text-xs text-muted">
			Then find it on the guitar: any string, any octave.
		</p>
	{:else}
		<div class="flex items-center gap-2 text-sm">
			<span class="chip tabular-nums" data-testid="playback-score">{score.right}/{score.total}</span
			>
			<span class="ml-auto flex items-center gap-1 text-xs text-muted"
				><Icon name="mic" size={14} />{problem ? 'No microphone' : 'Listening'}</span
			>
		</div>
		<div class="grid grid-cols-2 gap-2">
			<button
				class="btn btn-primary min-h-14"
				onclick={() => target && playNotes([target.midi])}
				data-testid="playback-replay"><Icon name="volume" />Replay</button
			>
			{#if status === 'listening'}
				<button class="btn min-h-14" onclick={() => finish(false)} data-testid="playback-show"
					><Icon name="help" />Show me</button
				>
			{:else}
				<button class="btn btn-primary min-h-14" onclick={newNote} data-testid="playback-next"
					>Next note<Icon name="forward" /></button
				>
			{/if}
		</div>
		<p class="text-center text-lg font-semibold" aria-live="polite" data-testid="playback-feedback">
			{#if status === 'right'}
				<span class="text-ok">Yes! That's {target?.item}</span>
			{:else if status === 'shown'}
				It was <b>{target?.item}</b>
			{:else if heard}
				<span class="text-muted">Hearing {heard}…</span>
			{:else}
				<span class="text-muted">Play it on your guitar</span>
			{/if}
		</p>
		{#if problem}
			<p class="rounded-xl bg-surface-2 px-3 py-2 text-sm" role="alert">
				<b>{MIC_HELP[problem].title}.</b>
				{MIC_HELP[problem].body}
			</p>
		{/if}
		{#if where && status !== 'listening'}
			<Fretboard
				dots={where.dots}
				window={where.window}
				labels="notes"
				compact
				label="Where {target?.item} is"
			/>
		{/if}
	{/if}
</div>
