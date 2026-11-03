<script lang="ts">
	// The weekly goal: a ring of counted days, minutes this week, the streak and the freeze.
	import Icon from '$lib/components/Icon.svelte';
	import Ring from '$lib/charts/Ring.svelte';
	import { weekLine } from './goalText';
	import type { Goals } from './goals';

	let {
		goals,
		size = 112,
		compact = false
	}: { goals: Goals; size?: number; compact?: boolean } = $props();
	const w = $derived(goals.week);
	const today = new Date().getDay();
	const DAY = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
</script>

{#snippet days()}
	<ol class="flex gap-1" aria-label="This week">
		{#each w.days as d, i (d.date)}
			<li
				class="flex size-6 items-center justify-center rounded-full text-[11px] font-semibold {d.counted
					? 'bg-accent text-accent-fg'
					: d.minutes > 0
						? 'border-2 border-accent text-fg'
						: 'bg-surface-2 text-muted'} {(today + 6) % 7 === i ? 'ring-2 ring-fg/40' : ''}"
				title="{d.date}: {d.minutes} min"
			>
				{DAY[i]}
			</li>
		{/each}
	</ol>
{/snippet}

{#if compact}
	<!-- Today: a small ring, one line, the days. -->
	<div
		class="flex items-center gap-3"
		data-testid="weekly-ring"
		data-counted={w.counted}
		data-minutes={w.minutes}
	>
		<Ring
			value={w.progress}
			size={64}
			label="{w.counted} of {w.goalDays} practice days this week"
			done={w.met}
		>
			<span class="text-xl leading-none font-bold tabular-nums">{w.counted}</span>
			<span class="text-[10px] leading-none text-muted">of {w.goalDays} days</span>
		</Ring>
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-semibold">
				{weekLine(w)}{#if goals.streak > 0}<span
						class="ml-1 inline-flex items-center gap-0.5 font-normal text-muted"
						data-testid="streak"><Icon name="flame" size={13} />{goals.streak} wk</span
					>{/if}
			</p>
			<p class="mb-1 text-xs text-muted tabular-nums">{w.minutes} min this week</p>
			{@render days()}
		</div>
	</div>
{:else}
	<div
		class="flex flex-wrap items-center justify-center gap-4"
		data-testid="weekly-ring"
		data-counted={w.counted}
		data-minutes={w.minutes}
	>
		<Ring
			value={w.progress}
			{size}
			label="{w.counted} of {w.goalDays} practice days this week"
			done={w.met}
		>
			<span class="text-3xl leading-none font-bold tabular-nums">{w.counted}</span>
			<span class="text-xs text-muted">of {w.goalDays} days</span>
		</Ring>
		<div class="min-w-48 flex-1">
			<p class="font-semibold">{weekLine(w)}</p>
			<p class="text-sm text-muted tabular-nums">
				{w.minutes} min this week · {w.dailyMin}+ min counts as a day
			</p>
			<div class="mt-2">{@render days()}</div>
			<p class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
				{#if goals.streak > 0}
					<span class="flex items-center gap-1" data-testid="streak"
						><Icon name="flame" size={14} />{goals.streak}-week streak</span
					>
				{/if}
				<span class="flex items-center gap-1"
					><Icon name="snow" size={14} />{goals.freezeLeft
						? 'A short week is covered by a freeze'
						: 'Last week’s freeze kept your streak'}</span
				>
			</p>
		</div>
	</div>
{/if}
