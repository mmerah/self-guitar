<script lang="ts">
	import { base } from '$app/paths';
	import { STYLES } from '$lib/content/schema';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { barNumber } from '$lib/progress';

	let { data } = $props();

	let query = $state('');
	let level = $state<number | 'all'>('all');
	let style = $state<string>('all');

	const styles = $derived(STYLES.filter((st) => data.songs.some((s) => s.style === st)));
	const levels = $derived([...new Set(data.songs.map((s) => s.level))].sort((a, b) => a - b));
	const songs = $derived(
		data.songs.filter(
			(s) =>
				(level === 'all' || s.level === level) &&
				(style === 'all' || s.style === style) &&
				s.title.toLowerCase().includes(query.trim().toLowerCase())
		)
	);
</script>

<svelte:head><title>Library · Self-Guitar</title></svelte:head>

<main class="mx-auto w-full max-w-5xl px-3 py-2 md:p-8">
	<PageHeader title="Library" />

	<div class="mb-3 flex flex-col gap-2">
		<label class="relative block">
			<span class="sr-only">Search by title</span>
			<span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">
				<Icon name="search" size={18} />
			</span>
			<input
				type="search"
				bind:value={query}
				placeholder="Search songs"
				class="min-h-11 w-full rounded-xl border border-line bg-surface pr-3 pl-10 text-fg"
			/>
		</label>
		<!-- One chip row: scrolls horizontally on phones, wraps on wider screens. -->
		<div
			class="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
			data-testid="filters"
		>
			<div class="flex shrink-0 gap-2" role="group" aria-label="Filter by level">
				<button
					class="btn min-h-9 shrink-0 rounded-full"
					aria-pressed={level === 'all'}
					onclick={() => (level = 'all')}>All levels</button
				>
				{#each levels as l (l)}
					<button
						class="btn min-h-9 shrink-0 rounded-full"
						aria-pressed={level === l}
						onclick={() => (level = l)}>Level {l}</button
					>
				{/each}
			</div>
			<span class="w-px shrink-0 self-stretch bg-line" aria-hidden="true"></span>
			<div class="flex shrink-0 gap-2" role="group" aria-label="Filter by style">
				{#each ['all', ...styles] as s (s)}
					<button
						class="btn min-h-9 shrink-0 rounded-full capitalize"
						aria-pressed={style === s}
						onclick={() => (style = s)}>{s === 'all' ? 'All styles' : s}</button
					>
				{/each}
			</div>
		</div>
	</div>

	{#if songs.length === 0}
		<p class="text-muted">No songs match these filters.</p>
	{/if}
	<ul
		class="grid grid-cols-[minmax(0,1fr)] gap-1.5 sm:grid-cols-[repeat(2,minmax(0,1fr))] sm:gap-2 lg:grid-cols-[repeat(3,minmax(0,1fr))]"
	>
		{#each songs as song (song.id)}
			{@const p = data.progress.get(song.id)}
			<li class="min-w-0">
				<a
					href="{base}/play/{song.id}"
					class="card flex h-full items-center gap-3 px-3 py-2 hover:bg-surface-2"
					data-testid="song-card"
				>
					<span
						class="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-sm font-bold text-accent"
						title="Level {song.level}"
						aria-label="Level {song.level}">L{song.level}</span
					>
					<span class="min-w-0 flex-1">
						<span class="block truncate leading-snug font-semibold">{song.title}</span>
						<span class="block truncate text-xs text-muted"
							>{song.composer} · <span class="sr-only">Level {song.level} · </span><span
								class="capitalize">{song.style}</span
							>
							· {song.key}</span
						>
					</span>
					{#if p && (p.lastPlayedAt || p.tempoPct !== 100)}
						<span class="chip shrink-0 tabular-nums" data-testid="card-progress"
							>{p.tempoPct}%{p.loopStartBar !== null && p.loopEndBar !== null
								? ` · ${barNumber(p.loopStartBar, song.pickup)}–${barNumber(p.loopEndBar, song.pickup)}`
								: ''}</span
						>
					{/if}
				</a>
			</li>
		{/each}
	</ul>
</main>
