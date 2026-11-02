<script lang="ts">
	import { page } from '$app/state';
	import { OFFLINE_MESSAGE } from '$lib/api';

	const offline = $derived(page.error?.message === OFFLINE_MESSAGE);
</script>

<svelte:head><title>{offline ? 'Offline' : 'Error'} · Self-Guitar</title></svelte:head>

<main class="mx-auto w-full max-w-xl p-6 md:p-10" data-testid="error-page">
	<h1 class="mb-2 text-2xl font-bold">
		{offline ? OFFLINE_MESSAGE : page.status === 404 ? 'Not found' : 'Something went wrong'}
	</h1>
	<p class="mb-6 text-muted">
		{#if offline}
			You're offline and this page hasn't been opened on this device yet. Connect once to make it
			available offline.
		{:else}
			{page.error?.message}
		{/if}
	</p>
	<div class="flex gap-2">
		<button class="btn" onclick={() => location.reload()}>Try again</button>
		<a class="btn btn-primary" href="/library">Library</a>
	</div>
</main>
