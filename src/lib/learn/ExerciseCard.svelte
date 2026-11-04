<script lang="ts">
	import { base } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import TabPlayer from '$lib/player/TabPlayer.svelte';
	import TuningNotice from './TuningNotice.svelte';
	import { ladderPct, scoreTempo } from './ladder';
	import type { Exercise, ExerciseStats } from './types';

	let { exercise, stats, from }: { exercise: Exercise; stats?: ExerciseStats; from?: string } =
		$props();

	const best = $derived(stats?.best ?? null);
	const pct = $derived(ladderPct(exercise, best));
	// The preview plays at the tempo the ladder would start at.
	const previewPct = $derived(
		Math.round(((stats?.resumeBpm ?? exercise.startBpm) / scoreTempo(exercise.tex)) * 100)
	);
	const href = $derived(
		`${base}/practice/exercise/${exercise.id}${from ? `?from=${encodeURIComponent(from)}` : ''}`
	);
</script>

<section
	class="card flex flex-col gap-2 p-3"
	data-testid="exercise-card"
	data-exercise={exercise.id}
>
	<header class="flex items-start gap-2">
		<span class="rounded-xl bg-surface-2 p-2 text-accent"><Icon name="metronome" /></span>
		<div class="min-w-0 flex-1">
			<h3 class="leading-tight font-semibold">{exercise.title}</h3>
			{#if exercise.howTo?.length}
				<p class="line-clamp-2 text-sm text-muted" data-testid="exercise-howto">
					{exercise.howTo[0]}
				</p>
			{/if}
		</div>
		{#if stats?.mastered}
			<span class="chip bg-ok! text-ok-fg!"><Icon name="star" size={14} />Mastered</span>
		{/if}
	</header>

	<TuningNotice tex={exercise.tex} compact />
	<TabPlayer tex={exercise.tex} compact initialTempoPct={previewPct} />

	<div>
		<div class="mb-1 flex justify-between text-sm">
			<span class="text-muted">Ladder {exercise.startBpm} → {exercise.targetBpm} · best clean</span>
			<span class="font-semibold tabular-nums" data-testid="exercise-best"
				>{best ?? '–'} / {exercise.targetBpm} BPM</span
			>
		</div>
		<div class="h-2 overflow-hidden rounded-full bg-surface-2">
			<div
				class="h-full rounded-full {stats?.mastered ? 'bg-ok' : 'bg-accent'}"
				style:width="{pct}%"
			></div>
		</div>
	</div>

	<a {href} class="btn btn-primary min-h-11 text-base" data-testid="exercise-practice">
		<Icon name="play" />Practise with the tempo ladder
	</a>
</section>
