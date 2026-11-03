<script lang="ts">
	import { countsAsDay, enoughMinutes } from '$lib/session/goals';
	// Practice minutes per day: one bar per day, a dashed line at the daily goal. Hover or tap a day
	// to read it; a hidden table carries the same numbers for screen readers.
	let {
		days,
		goal,
		height = 120
	}: { days: { date: string; minutes: number }[]; goal: number; height?: number } = $props();

	const W = 560;
	const max = $derived(Math.max(goal * 1.25, ...days.map((d) => d.minutes), 1));
	const bw = $derived(W / Math.max(1, days.length));
	const y = (m: number) => height - (m / max) * (height - 4);
	let sel = $state<number | null>(null);

	const fmt = (date: string) =>
		new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
			weekday: 'short',
			day: 'numeric',
			month: 'short'
		});
	const shown = $derived(sel ?? days.length - 1);
	const total = $derived(days.reduce((a, d) => a + d.minutes, 0));
	/** Monday labels under the bars. */
	const mondays = $derived(
		days.map((d, i) => ({ i, d })).filter(({ d }) => new Date(`${d.date}T12:00:00`).getDay() === 1)
	);
</script>

<div data-testid="day-bars">
	<p class="mb-1 flex items-baseline justify-between gap-2 text-sm" aria-live="polite">
		<span class="text-muted">{days[shown] ? fmt(days[shown].date) : ''}</span>
		<span class="font-semibold tabular-nums" data-testid="day-bars-readout"
			>{days[shown]?.minutes ?? 0} min</span
		>
	</p>
	<svg
		viewBox="0 0 {W} {height}"
		preserveAspectRatio="none"
		class="block h-32 w-full touch-pan-y"
		role="img"
		aria-label="Practice minutes per day, last {days.length} days: {total} minutes in all"
		onpointerleave={() => (sel = null)}
	>
		{#each days as d, i (d.date)}
			{#if d.minutes > 0}
				<rect
					x={i * bw + 1}
					y={y(d.minutes)}
					width={Math.max(1, bw - 2)}
					height={height - y(d.minutes)}
					rx="2"
					fill={countsAsDay(d.minutes, goal) ? 'var(--accent)' : 'var(--muted)'}
					opacity={sel === null || sel === i ? 1 : 0.55}
				/>
			{/if}
			<rect
				x={i * bw}
				y="0"
				width={bw}
				{height}
				fill="transparent"
				onpointerenter={() => (sel = i)}
				onpointerdown={() => (sel = i)}
				role="presentation"><title>{fmt(d.date)}: {d.minutes} min</title></rect
			>
		{/each}
		<line
			x1="0"
			x2={W}
			y1={y(goal)}
			y2={y(goal)}
			stroke="var(--text)"
			stroke-opacity="0.5"
			stroke-dasharray="4 4"
			vector-effect="non-scaling-stroke"
		/>
	</svg>
	<div class="relative mt-1 h-4 text-[11px] text-muted" aria-hidden="true">
		{#each mondays as { i, d } (d.date)}
			<span
				class="absolute -translate-x-0 whitespace-nowrap"
				style:left="{(i / days.length) * 100}%"
				>{new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, {
					day: 'numeric',
					month: 'short'
				})}</span
			>
		{/each}
	</div>
	<p class="mt-1 flex items-center gap-3 text-xs text-muted">
		<span class="flex items-center gap-1"
			><span class="inline-block size-2.5 rounded-sm bg-accent"></span>Day counted ({enoughMinutes(
				goal
			)}+ min)</span
		>
		<span class="flex items-center gap-1"
			><span class="inline-block size-2.5 rounded-sm bg-muted"></span>Shorter day</span
		>
		<span class="flex items-center gap-1"
			><span class="inline-block w-4 border-t border-dashed border-fg/50"></span>{goal} min goal</span
		>
	</p>
	<table class="sr-only">
		<caption>Practice minutes per day</caption>
		<tbody>
			{#each days as d (d.date)}
				<tr><th scope="row">{fmt(d.date)}</th><td>{d.minutes} min</td></tr>
			{/each}
		</tbody>
	</table>
</div>
