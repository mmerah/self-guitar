<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { getChord } from '$lib/chords';
	import ChordCard from '$lib/chords/ChordCard.svelte';
	import TuningNotice from './TuningNotice.svelte';
	import TabPlayer from '$lib/player/TabPlayer.svelte';
	import ExerciseCard from './ExerciseCard.svelte';
	import Inlines from './Inlines.svelte';
	import LessonBody from './LessonBody.svelte';
	import StrumPattern from './StrumPattern.svelte';
	import ToolCard from './ToolCard.svelte';
	import EarCard from './EarCard.svelte';
	import FretboardCard from './FretboardCard.svelte';
	import SongCard from './SongCard.svelte';
	import FretboardQuiz from '$lib/fretboard/FretboardQuiz.svelte';
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
			{#each b.ids as id, j (j)}
				{@const chord = getChord(id)}
				{#if chord}<ChordCard {chord} index={voicingIndex(id, b.voicings?.[j] ?? undefined)} />{/if}
			{/each}
		</div>
	{:else if b.t === 'atex'}
		<div class="flex flex-col gap-1.5">
			<TuningNotice tex={b.tex} compact />
			<TabPlayer tex={b.tex} compact />
		</div>
	{:else if b.t === 'strum'}
		<StrumPattern pattern={b.pattern} bpm={b.bpm} chord={b.chord} sub={b.sub ?? 8} ts={b.ts} />
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
	{:else if b.t === 'fretboard'}
		<FretboardCard spec={b.spec} label={b.label} from={lesson.id} />
	{:else if b.t === 'fretquiz'}
		<FretboardQuiz
			quiz={b.quiz}
			target={b.target ??
				(lesson.mastery?.type === 'fretboard' && lesson.mastery.quiz === b.quiz
					? lesson.mastery.target
					: undefined)}
		/>
	{:else if b.t === 'ear'}
		<EarCard kind={b.kind} set={b.set} dir={b.dir} n={b.n} keyName={b.key} />
	{:else if b.t === 'song'}
		<SongCard id={b.id} tempo={b.tempo} label={b.label} from={lesson.id} />
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
