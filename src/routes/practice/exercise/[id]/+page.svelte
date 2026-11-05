<script lang="ts">
	import { base } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import LadderPanel from '$lib/learn/LadderPanel.svelte';
	import { provideRecordItem } from '$lib/record/context';

	let { data } = $props();
	const ex = $derived(data.exercise);
	// The ladder's Rec control files takes under this exercise.
	provideRecordItem(() => ({ itemType: 'exercise', itemId: ex.id, title: ex.title }));
	let mastered = $state(false);

	const back = $derived(
		base + (data.fromSession ? '/session' : data.from ? `/learn/${data.from.id}` : '/learn')
	);
</script>

<svelte:head><title>{ex.title} · Self-Guitar</title></svelte:head>

<div class="flex h-dvh flex-col">
	<PageHeader
		bar
		theme={false}
		title={ex.title}
		subtitle="{ex.startBpm} → {ex.targetBpm} BPM{data.from ? ` · ${data.from.title}` : ''}"
		back={{ href: back, label: 'Back' }}
	>
		{#snippet actions()}
			{#if mastered}
				<span class="chip mr-2 bg-ok! text-ok-fg!" data-testid="ladder-mastered"
					><Icon name="star" size={14} />Mastered</span
				>
			{/if}
		{/snippet}
	</PageHeader>
	{#key ex.id}
		<LadderPanel exercise={ex} detail={data.detail} bind:mastered />
	{/key}
</div>
