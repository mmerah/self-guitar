<script lang="ts">
	import { base } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import LadderPanel from '$lib/learn/LadderPanel.svelte';

	let { data } = $props();
	const ex = $derived(data.exercise);
	let mastered = $state(false);

	const back = $derived(
		base + (data.fromSession ? '/session' : data.from ? `/learn/${data.from.id}` : '/learn')
	);
</script>

<svelte:head><title>{ex.title} · Self-Guitar</title></svelte:head>

<div class="flex h-dvh flex-col">
	<header class="flex items-center gap-2 border-b border-line bg-surface px-2 py-1 short:py-0">
		<a href={back} class="btn bg-transparent!" aria-label="Back"><Icon name="back" /></a>
		<div class="min-w-0 flex-1">
			<h1 class="truncate leading-tight font-semibold">{ex.title}</h1>
			<p class="truncate text-xs text-muted">
				Tempo ladder · {ex.startBpm} → {ex.targetBpm} BPM{data.from ? ` · ${data.from.title}` : ''}
			</p>
		</div>
		{#if mastered}
			<span class="chip mr-2 bg-ok! text-ok-fg!" data-testid="ladder-mastered"
				><Icon name="star" size={14} />Mastered</span
			>
		{/if}
	</header>

	{#key ex.id}
		<LadderPanel exercise={ex} detail={data.detail} bind:mastered />
	{/key}
</div>
