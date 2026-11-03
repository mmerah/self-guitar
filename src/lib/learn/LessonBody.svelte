<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { getChord } from '$lib/chords';
	import ChordCard from '$lib/chords/ChordCard.svelte';
	import TabPlayer from '$lib/player/TabPlayer.svelte';
	import ExerciseCard from './ExerciseCard.svelte';
	import Inlines from './Inlines.svelte';
	import LessonBody from './LessonBody.svelte';
	import StrumPattern from './StrumPattern.svelte';
	import ToolCard from './ToolCard.svelte';
	import { changesTarget } from './tools';
	import type { Block, Exercise, ExerciseStats, Lesson } from './types';

	let {
		blocks,
		exercises,
		stats = {},
		lesson
	}: {
		blocks: Block[];
		exercises: Exercise[];
		stats?: Record<string, ExerciseStats>;
		lesson: Lesson;
	} = $props();

	const voicingIndex = (id: string, voicing?: string) =>
		Math.max(0, getChord(id)?.voicings.findIndex((v) => v.id === voicing) ?? 0);
</script>

{#each blocks as b, i (i)}
	{#if b.t === 'h'}
		{#if b.level === 2}
			<h2 class="mt-3 text-xl font-bold"><Inlines nodes={b.c} /></h2>
		{:else}
			<h3 class="mt-2 text-lg font-semibold"><Inlines nodes={b.c} /></h3>
		{/if}
	{:else if b.t === 'p'}
		<p class="leading-relaxed"><Inlines nodes={b.c} /></p>
	{:else if b.t === 'list'}
		<svelte:element
			this={b.ordered ? 'ol' : 'ul'}
			class="flex flex-col gap-1.5 pl-6 leading-relaxed {b.ordered
				? 'list-decimal'
				: 'list-disc'} marker:text-accent"
		>
			{#each b.items as item, j (j)}
				<li><Inlines nodes={item} /></li>
			{/each}
		</svelte:element>
	{:else if b.t === 'chord'}
		{@const chord = getChord(b.id)}
		{#if chord}
			<div class="w-full max-w-60 self-center short:max-w-52" data-testid="lesson-chord">
				<ChordCard {chord} index={voicingIndex(b.id, b.voicing)} />
			</div>
		{/if}
	{:else if b.t === 'chords'}
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="lesson-chords">
			{#each b.ids as id (id)}
				{@const chord = getChord(id)}
				{#if chord}<ChordCard {chord} />{/if}
			{/each}
		</div>
	{:else if b.t === 'atex'}
		<TabPlayer tex={b.tex} compact />
	{:else if b.t === 'strum'}
		<StrumPattern pattern={b.pattern} bpm={b.bpm} chord={b.chord} />
	{:else if b.t === 'exercise'}
		{@const ex = exercises.find((e) => e.id === b.id)}
		{#if ex}<ExerciseCard exercise={ex} stats={stats[ex.id]} from={lesson.id} />{/if}
	{:else if b.t === 'tool'}
		<ToolCard
			name={b.name}
			params={b.params}
			label={b.label}
			context={{ from: lesson.id, target: changesTarget(lesson.mastery, b.params) }}
		/>
	{:else if b.t === 'callout'}
		<aside
			class="flex gap-3 rounded-2xl border-l-4 p-3 {b.kind === 'tip'
				? 'border-accent bg-surface-2'
				: 'border-danger bg-surface-2'}"
			data-testid="callout-{b.kind}"
		>
			<span class={b.kind === 'tip' ? 'text-accent' : 'text-danger'}
				><Icon name={b.kind === 'tip' ? 'star' : 'alert'} /></span
			>
			<div class="flex min-w-0 flex-1 flex-col gap-2">
				<LessonBody blocks={b.blocks} {exercises} {stats} {lesson} />
			</div>
		</aside>
	{/if}
{/each}
