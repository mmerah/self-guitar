<script lang="ts">
	import ToolHeader from '$lib/components/ToolHeader.svelte';
	import Calibrate from '$lib/listen/Calibrate.svelte';
</script>

<svelte:head><title>Mic timing · Self-Guitar</title></svelte:head>

<main class="mx-auto flex w-full max-w-xl flex-1 flex-col px-3 py-2 md:p-8">
	<ToolHeader title="Mic timing" />
	<Calibrate />
</main>
