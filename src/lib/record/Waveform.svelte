<script lang="ts">
	// A take's waveform, drawn from the peaks stored with it (never a full decode); tap to move
	// the playhead. A take without peaks gets them once (ensurePeaks: a low-rate decode, stored).
	import { onMount } from 'svelte';
	import { ensurePeaks } from './playback';
	import type { Take } from './types';
	import { drawPeaks, peaksFromLevels } from './waveform';

	let {
		take,
		progress = -1,
		height = 56,
		onseek
	}: {
		take: Pick<Take, 'id' | 'peaks'>;
		/** 0..1 played, -1 when stopped. */
		progress?: number;
		height?: number;
		onseek?: (frac: number) => void;
	} = $props();

	let canvas = $state<HTMLCanvasElement>();
	let levels = $state.raw<number[] | null>(null);
	let source = $state<'stored' | 'computed' | ''>('');
	let failed = $state(false);
	let width = $state(0);

	$effect(() => {
		const id = take.id;
		const stored = take.peaks;
		failed = false;
		if (stored?.length) {
			levels = stored;
			source = 'stored';
			return;
		}
		levels = null;
		source = '';
		ensurePeaks({ id }).then((l) => {
			if (id !== take.id) return;
			if (!l) failed = true;
			else {
				levels = l;
				source = 'computed';
			}
		});
	});

	function draw() {
		if (!canvas || !levels) return;
		const dpr = Math.min(2, devicePixelRatio || 1);
		canvas.width = Math.round(canvas.clientWidth * dpr);
		canvas.height = Math.round(height * dpr);
		const css = getComputedStyle(canvas);
		const buckets = Math.max(40, Math.min(400, Math.round((width || 300) / 3)));
		drawPeaks(
			canvas,
			peaksFromLevels(levels, buckets),
			css.getPropertyValue('--muted').trim() || '#888',
			progress,
			css.getPropertyValue('--accent').trim() || '#f90'
		);
	}
	$effect(() => {
		void progress;
		void levels;
		void width;
		void height;
		draw();
	});
	onMount(() => draw());

	function seek(e: PointerEvent) {
		if (!onseek || !canvas) return;
		const r = canvas.getBoundingClientRect();
		onseek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
	}
</script>

<div class="relative w-full" bind:clientWidth={width} style:height="{height}px">
	{#if failed}
		<p class="grid h-full place-items-center rounded-xl bg-surface-2 text-xs text-muted">
			No waveform (this browser cannot decode the take)
		</p>
	{:else}
		<canvas
			bind:this={canvas}
			class="h-full w-full rounded-xl bg-surface-2 {onseek ? 'cursor-pointer' : ''}"
			style:height="{height}px"
			onpointerdown={seek}
			data-testid="take-waveform"
			data-ready={!!levels}
			data-source={source}
			aria-label="Waveform of the take (tap to play from there)"
		></canvas>
	{/if}
</div>
