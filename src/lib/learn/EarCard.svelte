<script lang="ts">
	// ::ear in a lesson: a short ear quiz (its answers count toward ear mastery checks). The quiz
	// itself shows its answer choices (and how many are still locked), so the header only names it.
	import Icon from '$lib/components/Icon.svelte';
	import EarQuiz from '$lib/ear/EarQuiz.svelte';
	import PlaybackDrill from '$lib/ear/PlaybackDrill.svelte';
	import { DIR_LABEL, EAR_TITLE, itemLabel, type EarDir, type EarKind } from '$lib/ear/items';

	let {
		kind,
		set,
		dir,
		n,
		keyName
	}: { kind: EarKind; set: string[]; dir: EarDir; n: number; keyName?: string } = $props();
</script>

<section class="card flex flex-col gap-2" data-testid="lesson-ear" data-kind={kind}>
	<h3 class="flex items-center gap-2 font-semibold">
		<span class="text-accent"><Icon name="listen" size={20} /></span>
		<span class="min-w-0 flex-1 truncate" title={set.map((i) => itemLabel(kind, i)).join(' · ')}
			>{EAR_TITLE[kind]}</span
		>
		{#if kind === 'intervals'}<span class="chip">{DIR_LABEL[dir]}</span>{/if}
	</h3>
	{#if kind === 'playback'}
		<PlaybackDrill />
	{:else}
		<EarQuiz {kind} {set} {dir} key={keyName ?? 'random'} count={n} compact />
	{/if}
</section>
