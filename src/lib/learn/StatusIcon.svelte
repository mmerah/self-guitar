<script lang="ts">
	import type { LessonState } from './types';

	let { value, size = 'md' }: { value: LessonState; size?: 'sm' | 'md' } = $props();

	const label = {
		new: 'Not started',
		started: 'In progress',
		completed: 'Completed',
		mastered: 'Mastered'
	};
	const px = $derived(size === 'sm' ? 22 : 34);
</script>

<!-- Four shapes, not just colours: empty ring, half-filled ring, filled check, star medal. -->
<span
	class="inline-grid shrink-0 place-items-center"
	title={label[value]}
	data-state={value}
	style:width="{px}px"
	style:height="{px}px"
>
	<span class="sr-only">{label[value]}</span>
	<svg width={px} height={px} viewBox="0 0 24 24" aria-hidden="true">
		{#if value === 'mastered'}
			<circle cx="12" cy="12" r="11" fill="var(--ok)" />
			<path
				d="M12 5.2l2 4.1 4.5.6-3.3 3.1.8 4.4-4-2.2-4 2.2.8-4.4-3.3-3.1 4.5-.6z"
				fill="var(--ok-text)"
			/>
		{:else if value === 'completed'}
			<circle cx="12" cy="12" r="11" fill="var(--accent)" />
			<path
				d="M7 12.5l3.3 3.3L17 9"
				fill="none"
				stroke="var(--accent-text)"
				stroke-width="2.6"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		{:else if value === 'started'}
			<circle cx="12" cy="12" r="10" fill="none" stroke="var(--accent)" stroke-width="2.2" />
			<path d="M12 5.5a6.5 6.5 0 0 1 0 13z" fill="var(--accent)" />
		{:else}
			<circle cx="12" cy="12" r="10" fill="none" stroke="var(--border)" stroke-width="2.2" />
		{/if}
	</svg>
</span>
