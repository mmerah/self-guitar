<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { barNumber } from '$lib/progress';

	let { data } = $props();
	const last = $derived(data.continue);

	const soon = [
		{ title: 'Today', icon: 'today' },
		{ title: 'Learn', icon: 'learn' }
	] as const;
</script>

<svelte:head><title>Self-Guitar</title></svelte:head>

<main class="mx-auto w-full max-w-3xl p-4 md:p-8">
	<header class="mb-6 flex items-center justify-between">
		<h1 class="text-2xl font-bold">Self-Guitar</h1>
		<div class="md:hidden"><ThemeToggle /></div>
	</header>

	{#if last}
		<a
			href="/play/{last.songId}"
			class="card mb-4 flex min-h-28 items-center gap-4 border-accent! hover:bg-surface-2"
			data-testid="continue-card"
		>
			<span class="rounded-2xl bg-accent p-4 text-accent-fg"><Icon name="play" size={32} /></span>
			<span class="min-w-0 flex-1">
				<span class="block text-sm font-medium text-muted">Continue</span>
				<span class="block truncate text-xl font-semibold">{last.title}</span>
				<span class="mt-1 flex flex-wrap gap-2">
					<span class="chip">Tempo {last.tempoPct}%</span>
					{#if last.loopStartBar !== null && last.loopEndBar !== null}
						<span class="chip"
							>Loop bars {barNumber(last.loopStartBar, last.pickup)}–{barNumber(
								last.loopEndBar,
								last.pickup
							)}</span
						>
					{/if}
				</span>
			</span>
		</a>
	{/if}

	<a
		href="/library"
		class="card mb-4 flex items-center gap-4 hover:bg-surface-2 {last
			? 'min-h-20'
			: 'min-h-32 border-accent!'}"
		data-testid="library-entry"
	>
		<span class="rounded-2xl bg-surface-2 p-3 text-accent"><Icon name="library" size={30} /></span>
		<span>
			<span class="block text-xl font-semibold">Library</span>
			<span class="text-muted">Play along with tab: tempo, loops, mixer</span>
		</span>
	</a>

	<a
		href="/tools"
		class="card mb-4 flex min-h-20 items-center gap-4 hover:bg-surface-2"
		data-testid="tools-entry"
	>
		<span class="rounded-2xl bg-surface-2 p-3 text-accent"><Icon name="tools" size={30} /></span>
		<span>
			<span class="block text-xl font-semibold">Tools</span>
			<span class="text-muted">Tuner, metronome, chord library, chord changes</span>
		</span>
	</a>

	<div class="flex flex-wrap items-center gap-2 text-sm text-muted" aria-label="Coming soon">
		{#each soon as item (item.title)}
			<span class="chip gap-1 py-1 opacity-70"><Icon name={item.icon} size={16} />{item.title}</span
			>
		{/each}
		<span>coming soon</span>
	</div>

	<p class="mt-8 text-sm text-muted">
		<a class="underline" href="/about/attributions">Content attributions &amp; licenses</a>
	</p>
</main>
