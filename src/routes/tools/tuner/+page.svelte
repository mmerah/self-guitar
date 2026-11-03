<script lang="ts">
	import { page } from '$app/state';
	import ToolHeader from '$lib/components/ToolHeader.svelte';
	import Tuner from '$lib/tuner/Tuner.svelte';
	import { TUNINGS } from '$lib/tuner/tunings';

	let tuningId = $state(TUNINGS[0].id);
</script>

<svelte:head><title>Tuner · Self-Guitar</title></svelte:head>

<main
	class="mx-auto flex w-full max-w-xl flex-1 flex-col px-3 py-2 md:p-8 short:max-w-5xl short:py-2 md:short:p-4"
>
	<ToolHeader title="Tuner">
		{#snippet actions()}
			<label class="sr-only" for="tuning">Tuning</label>
			<select
				id="tuning"
				class="field text-sm font-medium"
				bind:value={tuningId}
				data-testid="tuning-select"
			>
				{#each TUNINGS as t (t.id)}
					<option value={t.id}>{t.name}</option>
				{/each}
			</select>
		{/snippet}
	</ToolHeader>

	<Tuner bind:tuningId initialTuning={page.url.searchParams.get('tuning')} />
</main>
