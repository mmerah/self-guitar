<script lang="ts">
	// An exercise in an alternate tuning (its score sets \tuning): say so before anything is played,
	// with a link to the tuner set to that tuning.
	import { base } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import { toolHref } from './tools';
	import { altTuning, tuningNoteLabel } from './tuning';

	let { tex, compact = false }: { tex: string; compact?: boolean } = $props();
	const tuning = $derived(altTuning(tex));
</script>

{#if tuning}
	<a
		href={base + toolHref('tuner', { tuning: tuning.id })}
		class="flex min-h-11 items-center gap-2 bg-surface-2 px-3 py-1.5 text-[15px] leading-snug {compact
			? 'rounded-xl'
			: 'border-b border-line'}"
		data-testid="tuning-notice"
		data-tuning={tuning.id}
	>
		<span class="text-accent"><Icon name="tuner" size={20} /></span>
		<span class="min-w-0 flex-1">
			<b>Tuning: {tuning.name}</b> — retune first
			<span class="block text-xs text-muted"
				>{tuning.notes.map(tuningNoteLabel).join(' ')}, low to high</span
			>
		</span>
		{#if compact}
			<span class="shrink-0 text-accent" aria-label="Open tuner"><Icon name="forward" /></span>
		{:else}
			<span class="shrink-0 text-sm font-semibold text-accent underline underline-offset-2"
				>Open tuner</span
			>
		{/if}
	</a>
{/if}
