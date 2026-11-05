<script lang="ts">
	// Progress: "Recordings: n · last on …", to hear progress over weeks (then vs now).
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { recordingsHref } from './context';
	import { listTakes, onTakesChanged } from './store';
	import type { Take } from './types';

	let takes = $state<Take[] | null>(null);
	const load = () =>
		listTakes().then(
			(t) => (takes = t),
			() => (takes = [])
		);
	onMount(() => {
		void load();
		return onTakesChanged(load);
	});
	const last = $derived(takes?.[0]);
	/** Items with two takes or more: then vs now is ready there. */
	const pairs = $derived(
		takes
			? new Set(
					takes.map((t) => `${t.itemType}:${t.itemId}`).filter((k, i, a) => a.indexOf(k) !== i)
				).size
			: 0
	);
</script>

{#if takes}
	<a
		href={recordingsHref(base)}
		class="card flex items-center gap-3 px-3! py-2.5! hover:bg-surface-2"
		data-testid="recordings-card"
		data-count={takes.length}
	>
		<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-accent"
			><Icon name="waveform" size={22} /></span
		>
		<span class="min-w-0 flex-1 leading-tight">
			<span class="block font-semibold">
				Recordings: {takes.length}{#if last}<span class="ml-1 font-normal text-muted"
						>· last on {new Date(last.createdAt).toLocaleDateString(undefined, {
							day: 'numeric',
							month: 'short'
						})}</span
					>{/if}
			</span>
			<span class="block text-xs text-muted">
				{#if !takes.length}Tap Rec in a player to hear yourself next to the tab
				{:else if pairs}Then vs now: {pairs} item{pairs === 1 ? '' : 's'} with 2+ takes
				{:else}Record the same piece again in a week to hear the difference{/if}
			</span>
		</span>
		<Icon name="forward" size={18} />
	</a>
{/if}
