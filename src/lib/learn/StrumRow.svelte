<script lang="ts">
	// A strum pattern as one compact, read-only row: counts (1 & 2 & …, or 1 e & a for 16ths) over
	// ↓ / ↑ arrows, the slot being played highlighted. The visual language of <StrumPattern>,
	// without its controls. 16ths stack the count over a smaller arrow, one row per bar. 6/8
	// counts 1–6 with the two big beats (1 and 4) marked.
	import Icon from '$lib/components/Icon.svelte';
	import {
		compoundBeat,
		slotsPerClick,
		strumCount,
		strumMeter,
		type StrumSub,
		type StrumTs
	} from './strum';
	import type { StrumSlot } from './types';

	let {
		pattern,
		active = -1,
		sub = 8,
		ts
	}: { pattern: StrumSlot[]; active?: number; sub?: StrumSub; ts?: StrumTs } = $props();
	const n = $derived(pattern.length);
	const per = $derived(slotsPerClick(sub, ts));
	const dense = $derived(sub === 16);
	// 16ths: one row per bar (two-bar patterns would be too narrow in one row on a phone).
	const perRow = $derived(dense ? strumMeter(n, sub, ts).beats * per : n);
	const rows = $derived(
		Array.from({ length: Math.ceil(n / perRow) }, (_, r) =>
			Array.from({ length: Math.min(perRow, n - r * perRow) }, (_, j) => r * perRow + j)
		)
	);
	const label = $derived(
		`Strum${dense ? ' (16ths)' : ''}: ${pattern
			.map((s) => (s === 'D' ? 'down' : s === 'U' ? 'up' : 'miss'))
			.join(', ')}`
	);
</script>

<div
	class="flex flex-col gap-0.5"
	role="img"
	aria-label={label}
	data-testid="strum-row"
	data-slot={active}
	data-sub={sub}
	data-ts={ts ?? ''}
>
	{#each rows as slots, r (r)}
		<ol
			class="grid gap-0.5"
			style="grid-template-columns: repeat({perRow}, minmax(0, 1fr))"
			aria-hidden="true"
		>
			{#each slots as i (i)}
				{@const slot = pattern[i]}
				{@const on = active === i}
				{@const count = strumCount(i, n, sub, ts)}
				{@const onBeat = ts ? compoundBeat(i) : i % per === 0}
				<li
					class="flex items-center justify-center rounded-lg py-px {dense
						? 'flex-col gap-0'
						: 'gap-0.5'} {on ? 'bg-accent text-accent-fg' : onBeat ? 'bg-surface-2' : ''}"
					data-active={on}
				>
					<span
						class="text-center leading-none tabular-nums {dense
							? 'text-[11px]'
							: 'w-3 text-xs'} {(count === '1' || (ts && count === '4')) && !on
							? 'font-extrabold text-accent'
							: !onBeat
								? on
									? ''
									: 'text-muted'
								: 'font-semibold'}"
						data-testid="strum-row-count">{count}</span
					>
					<span
						class={slot === '-'
							? on
								? ''
								: 'text-muted opacity-40'
							: on
								? ''
								: slot === 'D'
									? 'text-fg'
									: 'text-accent'}
					>
						{#if slot === 'D'}<Icon
								name="down"
								size={dense ? 16 : 18}
							/>{:else if slot === 'U'}<Icon name="up" size={dense ? 16 : 18} />{:else}<Icon
								name="minus"
								size={dense ? 12 : 14}
							/>{/if}
					</span>
				</li>
			{/each}
		</ol>
	{/each}
</div>
