<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import ToolHeader from '$lib/components/ToolHeader.svelte';
	import {
		chordId,
		CHORDS,
		parseChordName,
		parseQuality,
		QUALITIES,
		QUALITY_ORDER,
		ROOTS,
		type Chord,
		type Quality,
		type Root
	} from '$lib/chords';
	import ChordCard from '$lib/chords/ChordCard.svelte';
	import FingerLegend from '$lib/chords/FingerLegend.svelte';

	let query = $state('');
	let root = $state<Root | 'all'>('all');
	let quality = $state<Quality | 'all'>('all');
	/** Beginners first: only chords with an open-position voicing, unless "Barre / all". */
	let openOnly = $state(true);
	let searching = $state(false);

	const hasOpen = (c: Chord) => c.voicings.some((v) => v.kind === 'open');

	const chords = $derived.by(() => {
		const raw = query.trim();
		const q = raw.toLowerCase();
		// "Db", "a#m", "Bø", "C°7", "Cmin7": search by the canonical spelling too ("Bm7b5").
		const parsed = parseChordName(raw) ?? parseChordName(q);
		const alias = parsed ? chordId(parsed.root, parsed.quality).toLowerCase() : null;
		// A quality on its own ("maj7", "ø", "half", "dim"): every chord of that quality.
		const kind = parseQuality(raw) ?? (q ? parseQuality(q) : null);
		return CHORDS.filter(
			(c) =>
				(!openOnly || hasOpen(c)) &&
				(root === 'all' || c.root === root) &&
				(quality === 'all' || c.quality === quality) &&
				(!q ||
					c.id.toLowerCase().startsWith(q) ||
					(alias !== null && c.id.toLowerCase().startsWith(alias)) ||
					(kind !== null && kind !== '' && c.quality === kind) ||
					QUALITIES[c.quality].label.toLowerCase().startsWith(q) ||
					QUALITIES[c.quality].name.startsWith(q))
		);
	});
</script>

<svelte:head><title>Chords · Self-Guitar</title></svelte:head>

<main class="mx-auto w-full max-w-5xl px-3 py-2 md:p-8">
	<ToolHeader title="Chords" />

	<div class="mb-2 flex flex-col gap-1.5">
		{#if searching || query}
			<label class="relative block">
				<span class="sr-only">Search chords</span>
				<span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">
					<Icon name="search" size={18} />
				</span>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					type="search"
					bind:value={query}
					placeholder="Search chords (Am, G7, maj7, ø…)"
					class="field w-full pl-10"
					autofocus
				/>
			</label>
		{/if}
		<!-- One chip row (scrolls on phones): search, shapes, roots, types. -->
		<div
			class="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 pb-1 md:mx-0 md:flex-wrap md:px-0"
			data-testid="chord-filters"
		>
			<button
				class="btn min-h-9 shrink-0 rounded-full px-2.5"
				aria-pressed={searching || !!query}
				aria-label="Search chords"
				onclick={() => {
					searching = !searching;
					if (!searching) query = '';
				}}
				data-testid="chord-search-toggle"><Icon name="search" size={18} /></button
			>
			<div class="flex shrink-0 gap-1.5" role="group" aria-label="Shapes">
				<button
					class="btn min-h-9 shrink-0 rounded-full"
					aria-pressed={openOnly}
					onclick={() => (openOnly = true)}
					data-testid="open-only">Open</button
				>
				<button
					class="btn min-h-9 shrink-0 rounded-full"
					aria-pressed={!openOnly}
					aria-label="Barre / all"
					onclick={() => (openOnly = false)}>Barre / all</button
				>
			</div>
			<span class="h-6 w-px shrink-0 bg-line" aria-hidden="true"></span>
			<div class="flex shrink-0 gap-1.5" role="group" aria-label="Root">
				<button
					class="btn min-h-9 shrink-0 rounded-full"
					aria-pressed={root === 'all'}
					aria-label="All roots"
					onclick={() => (root = 'all')}>All</button
				>
				{#each ROOTS as r (r)}
					<button
						class="btn min-h-9 min-w-9 shrink-0 rounded-full px-2"
						aria-pressed={root === r}
						onclick={() => (root = r)}>{r}</button
					>
				{/each}
			</div>
			<span class="h-6 w-px shrink-0 bg-line" aria-hidden="true"></span>
			<div class="flex shrink-0 gap-1.5" role="group" aria-label="Quality">
				<button
					class="btn min-h-9 shrink-0 rounded-full"
					aria-pressed={quality === 'all'}
					aria-label="All types"
					onclick={() => (quality = 'all')}>All types</button
				>
				{#each QUALITY_ORDER as q (q)}
					<button
						class="btn min-h-9 shrink-0 rounded-full px-2.5"
						aria-pressed={quality === q}
						onclick={() => (quality = q)}>{QUALITIES[q].label}</button
					>
				{/each}
			</div>
		</div>
		<FingerLegend />
	</div>

	{#if chords.length === 0}
		<p class="text-muted">
			No chords match.
			{#if openOnly}<button class="text-accent underline" onclick={() => (openOnly = false)}
					>Include barre chords</button
				>{/if}
		</p>
	{/if}
	<ul class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:gap-3 lg:grid-cols-4">
		{#each chords as chord (chord.id)}
			<li><ChordCard {chord} /></li>
		{/each}
	</ul>
</main>
