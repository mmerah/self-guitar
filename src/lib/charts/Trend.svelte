<script lang="ts">
	// A small trend line (one series) with an optional dashed target. Hover or tap a point to read
	// it; the latest value is shown otherwise.
	let {
		points,
		target,
		unit,
		label,
		width = 150,
		height = 44
	}: {
		points: { date: string; value: number }[];
		target?: number;
		unit: string;
		label: string;
		width?: number;
		height?: number;
	} = $props();

	const PAD = 5;
	// x by date: gaps between practice days stay visible.
	const dayOf = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;
	const d0 = $derived(points.length ? dayOf(points[0].date) : 0);
	const dSpan = $derived(points.length > 1 ? dayOf(points[points.length - 1].date) - d0 || 1 : 1);
	const lo = $derived(Math.min(...points.map((p) => p.value), target ?? Infinity));
	const hi = $derived(Math.max(...points.map((p) => p.value), target ?? -Infinity));
	const span = $derived(hi - lo || 1);
	const x = (i: number) =>
		points.length > 1
			? PAD + ((dayOf(points[i].date) - d0) * (width - 2 * PAD)) / dSpan
			: width / 2;
	const y = (v: number) => height - PAD - ((v - lo) / span) * (height - 2 * PAD);
	let sel = $state<number | null>(null);
	const shown = $derived(points[sel ?? points.length - 1]);
	const fmt = (date: string) =>
		new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
</script>

<div class="flex items-center gap-2">
	<svg
		{width}
		{height}
		viewBox="0 0 {width} {height}"
		role="img"
		aria-label="{label}: {points.map((p) => `${p.value} on ${fmt(p.date)}`).join(', ')}"
		class="shrink-0 touch-pan-y"
		onpointerleave={() => (sel = null)}
	>
		{#if target !== undefined}
			<line
				x1="0"
				x2={width}
				y1={y(target)}
				y2={y(target)}
				stroke="var(--text)"
				stroke-opacity="0.4"
				stroke-dasharray="3 3"
			/>
		{/if}
		{#if points.length > 1}
			<polyline
				points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}
				fill="none"
				stroke="var(--accent)"
				stroke-width="2"
				stroke-linejoin="round"
				stroke-linecap="round"
			/>
		{/if}
		{#each points as p, i (p.date)}
			{#if sel === i || (sel === null && i === points.length - 1)}
				<circle
					cx={x(i)}
					cy={y(p.value)}
					r="4"
					fill="var(--accent)"
					stroke="var(--surface)"
					stroke-width="2"
				/>
			{/if}
			<circle
				cx={x(i)}
				cy={y(p.value)}
				r="10"
				fill="transparent"
				role="presentation"
				onpointerenter={() => (sel = i)}
				onpointerdown={() => (sel = i)}><title>{fmt(p.date)}: {p.value} {unit}</title></circle
			>
		{/each}
	</svg>
	<span class="w-16 text-right text-xs leading-tight text-muted tabular-nums" aria-hidden="true">
		<b class="block text-sm text-fg">{shown?.value} {unit}</b>{shown ? fmt(shown.date) : ''}
	</span>
</div>
