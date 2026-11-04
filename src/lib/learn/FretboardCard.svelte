<script lang="ts">
	// ::fretboard in a lesson: the overlay at its window (one orientation per screen shape, like
	// the explorer), a one-line legend, a link to the explorer. modes="all": chips switch between
	// the seven modes on one diagram, each mode's colour note picked out.
	import { untrack } from 'svelte';
	import { base } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import FingerLegend from '$lib/chords/FingerLegend.svelte';
	import Fretboard from '$lib/fretboard/Fretboard.svelte';
	import {
		MODE_COLOR,
		MODE_IDS,
		fretboardParams,
		isModeId,
		overlay,
		type FretboardSpec,
		type ModeId
	} from '$lib/theory/fretboard';
	import { SCALES } from '$lib/theory/scales';

	let { spec, label, from }: { spec: FretboardSpec; label?: string; from: string } = $props();
	let mode = $state<ModeId>(
		untrack(() => (spec.scale && isModeId(spec.scale) ? spec.scale : 'ionian'))
	);
	const shown = $derived<FretboardSpec>(spec.modes ? { ...spec, scale: mode } : spec);
	const view = $derived(overlay(shown));
	const href = $derived(
		`${base}/tools/fretboard?${new URLSearchParams({ ...fretboardParams(shown), from })}`
	);
	// highlight (string[]) and modes ('all' | false) also go to the neck as props; the overlay's
	// dots already carry the emphasis (accent), so a neck that ignores them shows the same thing.
	const tok = (t: string) => t.replace('b', '♭').replace('#', '♯');
</script>

<figure class="flex flex-col gap-1" data-testid="lesson-fretboard" data-mode={spec.mode}>
	<figcaption class="flex items-baseline justify-between gap-2 text-sm">
		<span class="font-semibold" data-testid="lesson-fretboard-title"
			>{spec.modes ? view.title : (label ?? view.title)}</span
		>
		<a
			{href}
			class="inline-flex shrink-0 items-center gap-1 text-accent"
			data-testid="fretboard-open">Explore<Icon name="forward" size={14} /></a
		>
	</figcaption>
	{#if spec.modes}
		<div class="flex flex-wrap gap-1" role="group" aria-label="Mode" data-testid="mode-chips">
			{#each MODE_IDS as m (m)}
				<button
					class="btn min-h-9 rounded-full px-2.5 text-sm"
					aria-pressed={mode === m}
					onclick={() => (mode = m)}
					data-testid="mode-chip"
					data-mode={m}
					>{SCALES[m].name}{#if MODE_COLOR[m].length}<span
							class="ml-1 text-xs font-bold {mode === m ? '' : 'text-[var(--degree)]'}"
							>{MODE_COLOR[m].map(tok).join(' ')}</span
						>{/if}</button
				>
			{/each}
		</div>
	{/if}
	<Fretboard
		dots={view.dots}
		regions={view.regions}
		window={view.window}
		labels={spec.labels}
		compact
		label={label ?? view.title}
		{...{ highlight: spec.highlight ?? [], modes: spec.modes ?? false }}
	/>
	{#if spec.labels === 'fingers'}
		<FingerLegend />
	{:else if view.dots.some((d) => d.root)}
		<p class="text-xs text-muted">
			<span class="mr-1 inline-block size-2.5 rounded-sm bg-accent align-middle"
			></span>Root{#if view.dots.some((d) => d.accent)}
				· <span class="mr-1 inline-block size-2.5 rounded-full bg-[var(--degree)] align-middle"
				></span>{spec.modes ? 'colour note' : 'highlighted'}{/if} · tap a dot to hear it
		</p>
	{/if}
</figure>
