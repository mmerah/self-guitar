<script lang="ts">
	// The week in one compact row (Progress and the session summary): a dot per day, the days
	// counted so far and the streak. The full ring lives on Today.
	import Icon from '$lib/components/Icon.svelte';
	import { weekLine } from './goalText';
	import type { Goals } from './goals';

	let { goals }: { goals: Goals } = $props();
	const w = $derived(goals.week);
	const DAY = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
	const todayIdx = (new Date().getDay() + 6) % 7;
</script>

<div
	class="flex flex-wrap items-center gap-x-4 gap-y-2"
	data-testid="week-days"
	data-counted={w.counted}
	data-minutes={w.minutes}
>
	<ol class="flex gap-1" aria-label="This week: {w.counted} of {w.goalDays} practice days">
		{#each w.days as d, i (d.date)}
			<li
				class="flex size-7 items-center justify-center rounded-full text-xs font-semibold {d.counted
					? 'bg-accent text-accent-fg'
					: d.minutes > 0
						? 'border-2 border-accent text-fg'
						: 'border border-line text-muted'} {todayIdx === i ? 'ring-2 ring-fg/40' : ''}"
				title="{d.date}: {d.minutes} min"
			>
				{DAY[i]}
			</li>
		{/each}
	</ol>
	<p class="text-sm">
		<span class="font-semibold">{weekLine(w)}</span>
		{#if goals.streak > 0}
			<span class="ml-2 inline-flex items-center gap-1 text-muted" data-testid="streak"
				><Icon name="flame" size={14} />{goals.streak}-week streak</span
			>
		{/if}
	</p>
</div>
