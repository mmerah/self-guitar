<script lang="ts">
	let {
		values,
		width = 96,
		height = 28,
		label
	}: { values: number[]; width?: number; height?: number; label: string } = $props();

	const PAD = 3;
	const points = $derived.by(() => {
		if (!values.length) return [];
		const max = Math.max(...values);
		const min = Math.min(...values);
		const span = max - min || 1;
		const step = values.length > 1 ? (width - 2 * PAD) / (values.length - 1) : 0;
		return values.map((v, i) => [
			values.length > 1 ? PAD + i * step : width / 2,
			height - PAD - ((v - min) / span) * (height - 2 * PAD)
		]);
	});
</script>

<svg {width} {height} viewBox="0 0 {width} {height}" role="img" aria-label={label} class="shrink-0">
	{#if points.length > 1}
		<polyline
			points={points.map((p) => p.join(',')).join(' ')}
			fill="none"
			stroke="var(--accent)"
			stroke-width="2"
			stroke-linejoin="round"
			stroke-linecap="round"
		/>
	{/if}
	{#if points.length}
		{@const [x, y] = points[points.length - 1]}
		<circle cx={x} cy={y} r="3" fill="var(--accent)" />
	{/if}
</svg>
