<script lang="ts">
	// A strum pattern as one compact, read-only row: counts (1 & 2 & …) over ↓ / ↑ arrows, the
	// slot being played highlighted. The visual language of <StrumPattern>, without its controls.
	import Icon from '$lib/components/Icon.svelte';
	import { strumCount } from './strum';
	import type { StrumSlot } from './types';

	let { pattern, active = -1 }: { pattern: StrumSlot[]; active?: number } = $props();
	const n = $derived(pattern.length);
</script>

<ol
	class="grid gap-0.5"
	style="grid-template-columns: repeat({n}, minmax(0, 1fr))"
	aria-label="Strum: {pattern
		.map((s) => (s === 'D' ? 'down' : s === 'U' ? 'up' : 'miss'))
		.join(', ')}"
	data-testid="strum-row"
	data-slot={active}
>
	{#each pattern as slot, i (i)}
		{@const on = active === i}
		{@const count = strumCount(i, n)}
		<li
			class="flex items-center justify-center gap-0.5 rounded-lg py-px {on
				? 'bg-accent text-accent-fg'
				: i % 2
					? ''
					: 'bg-surface-2'}"
			aria-hidden="true"
			data-active={on}
		>
			<span
				class="w-3 text-center text-xs leading-none tabular-nums {count === '1' && !on
					? 'font-extrabold text-accent'
					: i % 2
						? on
							? ''
							: 'text-muted'
						: 'font-semibold'}">{count}</span
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
				{#if slot === 'D'}<Icon name="down" size={18} />{:else if slot === 'U'}<Icon
						name="up"
						size={18}
					/>{:else}<Icon name="minus" size={14} />{/if}
			</span>
		</li>
	{/each}
</ol>
