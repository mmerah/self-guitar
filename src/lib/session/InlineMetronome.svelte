<script lang="ts">
	// A session warm-up's click, right in the block: start/stop, the tempo, the beat. No trip to
	// the metronome page (its full settings stay one link away).
	import { base } from '$app/paths';
	import { onDestroy, untrack } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { holdRepeat } from '$lib/actions/holdRepeat';
	import { getAudioContext } from '$lib/audio/context';
	import { claimPlayback, releasePlayback } from '$lib/audio/exclusive';
	import { Metronome } from '$lib/metronome/scheduler';
	import { clampBpm, TIME_SIGNATURES, type TimeSignature } from '$lib/metronome/timeline';

	let { params }: { params: Record<string, string> } = $props();

	let bpm = $state(untrack(() => clampBpm(Number(params.bpm) || 60)));
	const ts = $derived<TimeSignature>(
		params.ts && params.ts in TIME_SIGNATURES ? (params.ts as TimeSignature) : '4/4'
	);
	const beats = $derived(TIME_SIGNATURES[ts].beats);
	let running = $state(false);
	let beat = $state(-1);
	let metronome: Metronome | null = null;

	function stop() {
		metronome?.stop();
		running = false;
		beat = -1;
		releasePlayback(stop);
	}

	function toggle() {
		if (running) return stop();
		const ctx = getAudioContext();
		if (metronome?.ctx !== ctx) {
			metronome?.destroy();
			metronome = new Metronome(ctx, {
				settings: () => ({ bpm, timeSignature: ts, subdivision: 1, accent: true }),
				onClick: (c) => {
					if (c.sub === 0) beat = c.beat;
				}
			});
		}
		metronome.start();
		running = true;
		claimPlayback(stop);
	}

	const nudge = (d: number) => () => (bpm = clampBpm(bpm + d));

	onDestroy(() => {
		releasePlayback(stop);
		metronome?.destroy();
	});
</script>

<div
	class="flex w-full max-w-sm flex-col items-center gap-3"
	data-testid="inline-metronome"
	data-running={running}
>
	<div class="flex items-center gap-2" aria-hidden="true">
		{#each Array.from({ length: beats }, (_, i) => i) as i (i)}
			<span
				class="size-8 rounded-full border-2 {running && beat === i
					? i === 0
						? 'border-accent bg-accent'
						: 'border-fg bg-fg'
					: i === 0
						? 'border-accent'
						: 'border-line'}"
			></span>
		{/each}
	</div>
	<div class="flex w-full items-center justify-between gap-2">
		<button class="btn size-14 rounded-2xl" aria-label="Slower" use:holdRepeat={nudge(-1)}
			><Icon name="minus" size={26} /></button
		>
		<div class="text-center">
			<div class="text-5xl font-bold tabular-nums" data-testid="inline-bpm">{bpm}</div>
			<div class="text-sm text-muted">BPM · {ts}</div>
		</div>
		<button class="btn size-14 rounded-2xl" aria-label="Faster" use:holdRepeat={nudge(1)}
			><Icon name="plus" size={26} /></button
		>
	</div>
	<button
		class="btn btn-primary min-h-14 w-full text-lg"
		onclick={toggle}
		data-testid="inline-metronome-toggle"
		><Icon name={running ? 'stop' : 'play'} size={24} />{running
			? 'Stop'
			: 'Start the click'}</button
	>
	<a
		href="{base}/tools/metronome?{new URLSearchParams({
			...params,
			bpm: String(bpm),
			from: 'session'
		})}"
		class="inline-flex min-h-11 items-center text-sm text-muted underline underline-offset-2"
		data-testid="open-tool">Full metronome</a
	>
</div>
