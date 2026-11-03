<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { getAudioContext } from '$lib/audio/context';
	import { strum } from '$lib/audio/pluck';
	import ChordDiagram from './ChordDiagram.svelte';
	import { chordName, voicingFreqs, type Chord } from './model';
	import { startFret } from './diagram';

	let {
		chord,
		big = false,
		index = $bindable(0)
	}: { chord: Chord; big?: boolean; index?: number } = $props();

	// A different chord starts at its first voicing.
	let shownId = '';
	$effect.pre(() => {
		if (chord.id === shownId) return;
		if (shownId) index = 0;
		shownId = chord.id;
	});

	const voicing = $derived(chord.voicings[Math.min(index, chord.voicings.length - 1)]);
	const pos = $derived(startFret(voicing));

	function play() {
		strum(getAudioContext(), voicingFreqs(voicing));
	}
</script>

<article
	class="card flex h-full flex-col gap-2 p-3"
	data-testid="chord-card"
	data-chord={chord.id}
	data-voicing={voicing.id}
>
	<header class="flex items-baseline justify-between gap-2">
		<h2 class="font-bold {big ? 'text-4xl' : 'text-2xl'}">{chord.id}</h2>
		<span class="truncate text-xs text-muted">
			{voicing.label ?? (pos > 1 ? `Fret ${pos}` : 'Open')}
		</span>
	</header>
	<div class="mx-auto w-full {big ? 'max-w-64' : 'max-w-48'}">
		<ChordDiagram {voicing} label="{chordName(chord)} chord diagram" />
	</div>
	<div class="mt-auto flex items-center gap-1">
		{#if chord.voicings.length > 1}
			<button
				class="btn px-2 whitespace-nowrap tabular-nums"
				aria-label="Next voicing ({index + 1} of {chord.voicings.length})"
				onclick={() => (index = (index + 1) % chord.voicings.length)}
				data-testid="next-voicing">Voicing {index + 1}/{chord.voicings.length}</button
			>
		{/if}
		<button
			class="btn ml-auto shrink-0 px-2.5"
			onclick={play}
			aria-label="Play {chord.id}"
			data-testid="play-chord"
		>
			<Icon name="volume" size={20} /><span class={big ? '' : 'hidden sm:inline'}>Play</span>
		</button>
	</div>
</article>
