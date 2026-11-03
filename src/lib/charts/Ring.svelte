<script lang="ts">
	// A progress ring (weekly goal). Inline SVG; the centre is the caller's content.
	import type { Snippet } from 'svelte';

	let {
		value,
		size = 120,
		stroke = 12,
		label,
		done = false,
		children
	}: {
		/** 0..1 */
		value: number;
		size?: number;
		stroke?: number;
		label: string;
		/** Goal met: the ring turns the success colour. */
		done?: boolean;
		children?: Snippet;
	} = $props();

	const r = $derived((size - stroke) / 2);
	const c = $derived(2 * Math.PI * r);
	const v = $derived(Math.max(0, Math.min(1, value)));
</script>

<div class="relative shrink-0" style:width="{size}px" style:height="{size}px">
	<svg width={size} height={size} viewBox="0 0 {size} {size}" role="img" aria-label={label}>
		<title>{label}</title>
		<circle
			cx={size / 2}
			cy={size / 2}
			{r}
			fill="none"
			stroke="var(--surface-2)"
			stroke-width={stroke}
		/>
		{#if v > 0}
			<circle
				class="ring-arc"
				cx={size / 2}
				cy={size / 2}
				{r}
				fill="none"
				stroke={done ? 'var(--ok)' : 'var(--accent)'}
				stroke-width={stroke}
				stroke-linecap="round"
				stroke-dasharray={c}
				stroke-dashoffset={c * (1 - v)}
				transform="rotate(-90 {size / 2} {size / 2})"
			/>
		{/if}
	</svg>
	<div class="absolute inset-0 flex flex-col items-center justify-center text-center">
		{@render children?.()}
	</div>
</div>

<style>
	.ring-arc {
		transition: stroke-dashoffset 600ms ease-out;
	}
	@media (prefers-reduced-motion: reduce) {
		.ring-arc {
			transition: none;
		}
	}
</style>
