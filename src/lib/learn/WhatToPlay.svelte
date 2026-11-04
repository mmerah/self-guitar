<script lang="ts">
	// "What to play": the exercise's steps (numbered, short) and its chords as diagrams with their
	// finger numbers (tap to hear). Shown right above the tab. Every step shows, wrapped, until
	// the first clean pass; then the steps fold away (one line, or only the chords when there are
	// chords) and "Steps" opens them again.
	import Icon from '$lib/components/Icon.svelte';
	import { getAudioContext } from '$lib/audio/context';
	import { strum } from '$lib/audio/pluck';
	import { chordRef, voicingFreqs } from '$lib/chords';
	import ChordDiagram from '$lib/chords/ChordDiagram.svelte';
	import type { Exercise } from './types';

	let {
		exercise,
		expanded = $bindable(true)
	}: { exercise: Pick<Exercise, 'howTo' | 'chords'>; expanded?: boolean } = $props();

	/** Chord names, or "Name@voicing-id" for a voicing other than the first. */
	const chords = $derived(
		(exercise.chords ?? [])
			.map((c) => chordRef(c))
			.filter((c) => c !== undefined)
			.map(({ chord, voicing }) => ({ id: chord.id, voicing }))
	);
	const steps = $derived(exercise.howTo ?? []);
	/** One chord sits beside the steps; more go in a row under them. */
	const side = $derived(chords.length === 1);

	function hear(v: (typeof chords)[number]['voicing']) {
		strum(getAudioContext(), voicingFreqs(v));
	}
</script>

{#snippet more()}
	<button
		class="-my-1 flex min-h-9 shrink-0 items-center gap-0.5 rounded-lg px-1.5 text-xs font-medium text-muted"
		onclick={() => (expanded = true)}
		aria-expanded="false"
		data-testid="how-to-toggle"
		>Steps<span class="rotate-90"><Icon name="forward" size={14} /></span></button
	>
{/snippet}

<section
	class="flex gap-x-2 gap-y-1 border-b border-line bg-surface px-3 py-1 {side || !expanded
		? 'items-center'
		: 'flex-col'}"
	aria-label="What to play"
	data-testid="what-to-play"
	data-expanded={expanded}
>
	{#if steps.length && expanded}
		<ol
			class="min-w-0 flex-1 list-decimal self-start pl-5 text-[15px] leading-snug marker:font-semibold marker:text-accent short:text-sm"
			data-testid="how-to"
		>
			{#each steps as step, i (i)}<li>{step}</li>{/each}
		</ol>
	{:else if steps.length && !chords.length}
		<p class="min-w-0 flex-1 truncate text-[15px] leading-snug" data-testid="how-to">
			<span class="font-semibold text-accent">1.</span>
			{steps[0]}
		</p>
		{@render more()}
	{/if}
	{#if chords.length}
		<ul
			class="flex min-w-0 shrink-0 gap-1.5 overflow-x-auto {side && expanded
				? ''
				: '-mx-3 px-3'} {!expanded ? 'flex-1' : ''}"
			aria-label="Chords (tap to hear)"
			data-testid="chord-row"
		>
			{#each chords as chord, i (i)}
				<li class="shrink-0">
					<button
						class="flex items-start gap-0.5 rounded-xl bg-surface-2 py-0.5 pr-1 pl-1.5"
						onclick={() => hear(chord.voicing)}
						aria-label="Hear {chord.id}"
						title="Tap to hear {chord.id}"
						data-testid="chord-mini"
						data-chord={chord.id}
						data-voicing={chord.voicing.id}
					>
						<span class="min-w-4 pt-0.5 text-left text-[15px] leading-tight font-bold"
							>{chord.id}</span
						>
						<span class="block w-[72px]" data-testid="chord-mini-diagram"
							><ChordDiagram voicing={chord.voicing} label="{chord.id} chord diagram" mini /></span
						>
					</button>
				</li>
			{/each}
		</ul>
		{#if !expanded && steps.length}{@render more()}{/if}
	{/if}
</section>
