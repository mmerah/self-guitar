<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import ToolHeader from '$lib/components/ToolHeader.svelte';
	import {
		chordId,
		CHORDS,
		parseChordName,
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

	const hasOpen = (c: Chord) => c.voicings.some((v) => v.kind === 'open');

	const chords = $derived.by(() => {
		const q = query.trim().toLowerCase();
		// "Db", "a#m": search by the canonical spelling too.
		const parsed = parseChordName(q);
		const alias = parsed ? chordId(parsed.root, parsed.quality).toLowerCase() : null;
		return CHORDS.filter(
			(c) =>
				(!openOnly || hasOpen(c)) &&
				(root === 'all' || c.root === root) &&
				(quality === 'all' || c.quality === quality) &&
				(!q ||
					c.id.toLowerCase().startsWith(q) ||
					(alias !== null && c.id.toLowerCase().startsWith(alias)) ||
					QUALITIES[c.quality].label.toLowerCase().startsWith(q))
		);
	});
</script>

<svelte:head><title>Chords · Self-Guitar</title></svelte:head>

<main class="mx-auto w-full max-w-5xl p-4 md:p-8">
	<ToolHeader title="Chords" />

	<div class="mb-4 flex flex-col gap-3">
		<label class="relative block">
			<span class="sr-only">Search chords</span>
			<span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">
				<Icon name="search" size={18} />
			</span>
			<input
				type="search"
				bind:value={query}
				placeholder="Search chords (Am, G7, sus…)"
				class="field w-full pl-10"
			/>
		</label>
		<div class="segmented max-w-sm" role="group" aria-label="Shapes">
			<button aria-pressed={openOnly} onclick={() => (openOnly = true)} data-testid="open-only"
				>Open chords</button
			>
			<button aria-pressed={!openOnly} onclick={() => (openOnly = false)}>Barre / all</button>
		</div>
		<div
			class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0"
			role="group"
			aria-label="Root"
		>
			<button class="btn shrink-0" aria-pressed={root === 'all'} onclick={() => (root = 'all')}
				>All roots</button
			>
			{#each ROOTS as r (r)}
				<button class="btn shrink-0" aria-pressed={root === r} onclick={() => (root = r)}
					>{r}</button
				>
			{/each}
		</div>
		<div
			class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0"
			role="group"
			aria-label="Quality"
		>
			<button
				class="btn shrink-0"
				aria-pressed={quality === 'all'}
				onclick={() => (quality = 'all')}>All types</button
			>
			{#each QUALITY_ORDER as q (q)}
				<button class="btn shrink-0" aria-pressed={quality === q} onclick={() => (quality = q)}
					>{QUALITIES[q].label}</button
				>
			{/each}
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
	<ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
		{#each chords as chord (chord.id)}
			<li><ChordCard {chord} /></li>
		{/each}
	</ul>
</main>
