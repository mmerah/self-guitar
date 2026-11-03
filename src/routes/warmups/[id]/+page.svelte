<script lang="ts">
	import { base } from '$app/paths';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import WarmupRunner from '$lib/warmups/WarmupRunner.svelte';
	import { GOAL_LABEL } from '$lib/warmups/steps';

	let { data } = $props();
	const w = $derived(data.warmup);
</script>

<svelte:head><title>{w.title} · Self-Guitar</title></svelte:head>

<div class="flex h-dvh flex-col">
	<PageHeader
		bar
		theme={false}
		title={w.title}
		subtitle="{GOAL_LABEL[w.goal]} · Level {w.level} · {w.minutes} min"
		back={{ href: `${base}/library?tab=warmups`, label: 'Back to warm-ups' }}
	/>
	{#key w.id}
		<WarmupRunner warmup={w} index={data.index} />
	{/key}
</div>
