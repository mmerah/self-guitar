<script lang="ts" module>
	export type Segment = { key: string; label: string; value: number; color: string };
</script>

<script lang="ts">
	// One horizontal 100% bar split into segments (skills per status), 2px gaps between them.
	let { segments, label }: { segments: Segment[]; label: string } = $props();
	const W = 300;
	const H = 14;
	const total = $derived(segments.reduce((a, s) => a + s.value, 0) || 1);
	const parts = $derived.by(() => {
		let x = 0;
		return segments
			.filter((s) => s.value > 0)
			.map((s) => {
				const w = (s.value / total) * W;
				const part = { ...s, x, w };
				x += w;
				return part;
			});
	});
</script>

<svg
	viewBox="0 0 {W} {H}"
	preserveAspectRatio="none"
	class="block h-3.5 w-full"
	role="img"
	aria-label="{label}: {segments.map((s) => `${s.value} ${s.label}`).join(', ')}"
>
	{#each parts as p, i (p.key)}
		<rect
			x={p.x + (i ? 1 : 0)}
			y="0"
			width={Math.max(1, p.w - (i ? 1 : 0) - (i < parts.length - 1 ? 1 : 0))}
			height={H}
			rx="3"
			fill={p.color}><title>{p.value} {p.label}</title></rect
		>
	{/each}
</svg>
