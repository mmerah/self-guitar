<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { getChord } from '$lib/chords';
	import { confirmMastery } from './client';
	import ToolCard from './ToolCard.svelte';
	import type { Exercise, LearnProgress, Lesson, Mastery, MasteryProgress } from './types';

	let {
		lesson,
		mastery,
		status,
		exercises,
		onclose,
		onprogress
	}: {
		lesson: Lesson;
		mastery: Mastery;
		status: MasteryProgress | null;
		exercises: Exercise[];
		onclose: () => void;
		onprogress: (p: LearnProgress) => void;
	} = $props();

	let checked = $state<boolean[]>([]);
	let saving = $state(false);
	let problem = $state('');
	const done = $derived(status?.done ?? false);
	const allTicked = $derived(mastery.type !== 'self' || mastery.items.every((_, i) => checked[i]));

	async function confirm() {
		saving = true;
		problem = '';
		try {
			const items = mastery.type === 'self' ? mastery.items.map((_, i) => i) : undefined;
			onprogress(await confirmMastery(lesson.id, items));
		} catch (e) {
			problem = (e as Error).message;
		} finally {
			saving = false;
		}
	}

	const chordId = (c: string) => getChord(c)?.id ?? c;
	const exercise = $derived(
		mastery.type === 'exercise' ? exercises.find((e) => e.id === mastery.id) : undefined
	);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

{#snippet goal(label: string, value: number, target: number, unit: string, from = 0)}
	{@const pct = Math.max(0, Math.min(100, ((value - from) / Math.max(1, target - from)) * 100))}
	<div data-testid="mastery-goal" data-value={value} data-target={target}>
		<div class="mb-1 flex items-baseline justify-between gap-2">
			<span class="text-sm text-muted">{label}</span>
			<span class="text-lg font-semibold tabular-nums"
				>{value || '–'} <span class="text-muted">/ {target}{unit}</span></span
			>
		</div>
		<div class="h-2.5 overflow-hidden rounded-full bg-surface-2">
			<div
				class="h-full rounded-full {done ? 'bg-ok' : 'bg-accent'}"
				style:width="{done ? 100 : pct}%"
			></div>
		</div>
	</div>
{/snippet}

<!-- Phone: the sheet rises from just above the bottom nav (which stays visible and usable). -->
<div
	class="fixed inset-x-0 top-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 flex items-end justify-center bg-black/50 md:bottom-0 md:items-center"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && onclose()}
>
	<div
		class="flex max-h-full w-full max-w-lg flex-col gap-4 overflow-auto rounded-t-3xl border border-line bg-surface p-5 md:max-h-[90dvh] md:rounded-3xl short:gap-2 short:p-3"
		role="dialog"
		aria-modal="true"
		aria-labelledby="mastery-title"
		data-testid="mastery-sheet"
		data-done={done}
	>
		<header class="flex items-center gap-3">
			<span class="rounded-2xl p-2 {done ? 'bg-ok text-ok-fg' : 'bg-surface-2 text-accent'}"
				><Icon name="star" size={26} /></span
			>
			<div class="min-w-0 flex-1">
				<h2 id="mastery-title" class="text-xl font-bold">Mastery check</h2>
				<p class="text-sm text-muted">{done ? 'Passed. Well done!' : lesson.title}</p>
			</div>
			<button class="btn" onclick={onclose} aria-label="Close"><Icon name="close" /></button>
		</header>

		{#if mastery.type === 'changes'}
			<p>
				Reach <b>{mastery.target}</b> clean changes in one minute between
				<b>{chordId(mastery.a)}</b> and <b>{chordId(mastery.b)}</b>.
			</p>
			{@render goal('Your best', status?.value ?? 0, mastery.target, '/min')}
			<ToolCard
				name="changes"
				params={{ a: mastery.a, b: mastery.b }}
				context={{ from: lesson.id, target: mastery.target }}
			/>
		{:else if mastery.type === 'exercise' && exercise}
			<p>
				Play <b>{exercise.title}</b> cleanly <b>{exercise.cleanReps} times in a row</b> at
				<b>{mastery.bpm} BPM</b> on the tempo ladder.
			</p>
			{@render goal('Best clean', status?.value ?? 0, mastery.bpm, ' BPM', exercise.startBpm)}
			<a
				href="/practice/exercise/{exercise.id}?from={encodeURIComponent(lesson.id)}"
				class="btn btn-primary min-h-12 text-base"><Icon name="play" />Practise now</a
			>
		{:else if mastery.type === 'tuner'}
			<p>Tune all six strings to within <b>±5 cents</b> with the tuner, without help.</p>
			<ToolCard name="tuner" params={{}} context={{ from: lesson.id }} />
			{#if !done}
				<button
					class="btn btn-primary min-h-14 text-base"
					onclick={confirm}
					disabled={saving}
					data-testid="mastery-confirm"><Icon name="check" />All six strings are in tune</button
				>
			{/if}
		{:else if mastery.type === 'self'}
			<p>Be honest with yourself: tick each one you can do comfortably.</p>
			<ul class="flex flex-col gap-2">
				{#each mastery.items as item, i (i)}
					<li>
						<label class="flex min-h-14 items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
							<input
								type="checkbox"
								class="size-6 shrink-0 accent-(--accent)"
								checked={done || checked[i]}
								disabled={done}
								onchange={(e) => (checked[i] = e.currentTarget.checked)}
								data-testid="mastery-item"
							/>
							<span>{item}</span>
						</label>
					</li>
				{/each}
			</ul>
			{#if !done}
				<button
					class="btn btn-primary min-h-14 text-base"
					onclick={confirm}
					disabled={saving || !allTicked}
					data-testid="mastery-confirm"><Icon name="check" />I can do all of these</button
				>
			{/if}
		{/if}

		{#if problem}<p class="text-danger" role="alert">{problem}</p>{/if}
		{#if done}
			<p class="flex items-center gap-2 font-semibold text-ok" data-testid="mastery-passed">
				<Icon name="check" />Mastery check passed
			</p>
		{/if}
	</div>
</div>
