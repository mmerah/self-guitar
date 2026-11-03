<script lang="ts">
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import StatusIcon from '$lib/learn/StatusIcon.svelte';
	import {
		gatedBy,
		isDone,
		lessonsByUnit,
		levelStats,
		MASTERY_LABEL,
		placeOf,
		recommended,
		stateOf
	} from '$lib/learn/tree';
	import type { Lesson, Level, SkillStatus, Unit } from '$lib/learn/types';

	let { data } = $props();
	const index = $derived(data.index);
	const progress = $derived(data.progress);
	const byUnit = $derived(lessonsByUnit(index));
	const next = $derived(recommended(index, progress));
	const nextPlace = $derived(next && placeOf(index, next));

	// Tablet/desktop: a level sidebar and the selected level's units in a grid.
	let wide = $state(false);
	let selected = $state<number | null>(null);
	const shownLevel = $derived(
		index.levels.find((l) => l.id === (selected ?? next?.level ?? 0)) ?? index.levels[0]
	);

	onMount(() => {
		const q = matchMedia('(min-width: 1024px)');
		const update = () => (wide = q.matches);
		update();
		q.addEventListener('change', update);
		return () => q.removeEventListener('change', update);
	});

	/** "2 started · 0/9 done" (started lessons count too: the tree shows where you are). */
	const countText = (st: { total: number; done: number; started: number }) =>
		`${st.started ? `${st.started} started · ` : ''}${st.done}/${st.total} done`;

	// Phone: the current level (the next lesson's) and the one after start open; done and far-off
	// levels start collapsed. A tap on a level header toggles it.
	let toggled = $state<Record<number, boolean>>({});
	const currentLevel = $derived(next?.level ?? 0);
	const isOpen = (id: number) => toggled[id] ?? (id === currentLevel || id === currentLevel + 1);

	const skillDot: Record<SkillStatus, string> = {
		new: 'bg-line',
		learning: 'bg-accent',
		mastered: 'bg-ok'
	};
</script>

<svelte:head><title>Learn · Self-Guitar</title></svelte:head>

{#snippet continueCard()}
	{#if next && nextPlace}
		{@const started = stateOf(progress, next.id) === 'started'}
		<a
			href="{base}/learn/{next.id}"
			class="card flex items-center gap-4 border-accent! hover:bg-surface-2 short:py-2"
			data-testid="learn-continue"
			data-lesson={next.id}
		>
			<span class="rounded-2xl bg-accent p-3 text-accent-fg short:p-2"
				><Icon name="play" size={30} /></span
			>
			<span class="min-w-0 flex-1">
				<span class="block text-sm font-medium text-muted"
					>{started ? 'Continue' : 'Next up'} · Level {next.level} · {nextPlace.unit.title}</span
				>
				<span class="block truncate text-xl font-semibold">{next.title}</span>
				<span class="text-sm text-muted">{next.minutes} min</span>
			</span>
			<span class="btn btn-primary hidden sm:inline-flex">{started ? 'Continue' : 'Start'}</span>
		</a>
	{:else if index.lessons.length}
		<p class="card text-center font-semibold" data-testid="learn-all-done">
			Every lesson so far is done. New levels are on the way.
		</p>
	{/if}
{/snippet}

{#snippet lessonRow(lesson: Lesson)}
	{@const st = stateOf(progress, lesson.id)}
	{@const isNext = next?.id === lesson.id}
	<li>
		<a
			href="{base}/learn/{lesson.id}"
			class="flex min-h-14 items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2 {isNext
				? 'bg-surface-2 ring-2 ring-accent'
				: ''}"
			data-testid="lesson-row"
			data-lesson={lesson.id}
			data-state={st}
		>
			<StatusIcon value={st} />
			<span class="min-w-0 flex-1">
				<span class="block leading-tight font-medium">{lesson.title}</span>
				<span class="text-xs text-muted"
					>{lesson.minutes} min{lesson.mastery
						? ` · ${MASTERY_LABEL[lesson.mastery.type]}`
						: ''}</span
				>
			</span>
			{#if isNext}<span class="chip chip-accent">Continue</span>{/if}
		</a>
	</li>
{/snippet}

{#snippet skills(unit: Unit)}
	<ul class="flex flex-wrap gap-1.5" aria-label="Skills">
		{#each unit.skills as s (s.id)}
			{@const st = progress.skills[s.id] ?? 'new'}
			<li class="chip gap-1.5" title="{s.description} ({st})" data-skill={s.id} data-status={st}>
				<span class="size-2 rounded-full {skillDot[st]}"></span>{s.name}
			</li>
		{/each}
	</ul>
{/snippet}

{#snippet unitBody(unit: Unit)}
	{@const lessons = byUnit.get(unit.id) ?? []}
	{@render skills(unit)}
	{#if lessons.length}
		<ol class="mt-2 grid gap-1 {wide ? '' : 'sm:grid-cols-2'}">
			{#each lessons as lesson (lesson.id)}
				{@render lessonRow(lesson)}
			{/each}
		</ol>
	{:else}
		<p class="mt-2 px-2 text-sm text-muted">Lessons coming soon</p>
	{/if}
{/snippet}

{#snippet levelHeader(level: Level, open?: boolean)}
	{@const stats = levelStats(level, byUnit, progress)}
	{@const gate = gatedBy(level, progress)}
	<div class="flex items-start gap-3">
		<span
			class="grid size-12 shrink-0 place-items-center rounded-2xl text-xl font-bold {stats.mastered
				? 'bg-ok text-ok-fg'
				: 'bg-surface-2 text-accent'}">{level.id}</span
		>
		<div class="min-w-0 flex-1">
			<h2 class="flex items-start gap-2 text-xl leading-tight font-bold">
				<span class="min-w-0 flex-1">Level {level.id} · {level.title}</span>
				{#if open !== undefined}
					<span
						class="mt-0.5 shrink-0 text-muted transition-transform {open ? 'rotate-90' : ''}"
						aria-hidden="true"><Icon name="forward" size={20} /></span
					>
				{/if}
			</h2>
			<p class="text-sm text-muted">{level.goal}</p>
			<div class="mt-1.5 flex flex-wrap items-center gap-2">
				{#if stats.total}
					<span class="chip" data-testid="level-progress">{countText(stats)}</span>
				{/if}
				{#if stats.mastered}
					<span class="chip bg-ok! text-ok-fg!"><Icon name="star" size={14} />Mastered</span>
				{:else if gate !== null}
					<span
						class="rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs text-muted"
						data-testid="level-gate">Recommended after Level {gate}</span
					>
				{/if}
			</div>
		</div>
	</div>
{/snippet}

<main class="mx-auto w-full max-w-6xl p-4 md:p-8">
	<header class="mb-4 flex items-center justify-between short:mb-2">
		<h1 class="text-2xl font-bold">Learn</h1>
		<div class="md:hidden"><ThemeToggle /></div>
	</header>

	<div class="mb-6 short:mb-4">{@render continueCard()}</div>

	{#if wide}
		<div class="grid grid-cols-[16rem_1fr] gap-6" data-testid="learn-wide">
			<nav aria-label="Levels" class="flex flex-col gap-1">
				{#each index.levels as level (level.id)}
					{@const stats = levelStats(level, byUnit, progress)}
					{@const gate = gatedBy(level, progress)}
					<button
						class="flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-2 {shownLevel.id ===
						level.id
							? 'bg-surface-2 ring-2 ring-accent'
							: ''} {gate !== null && !stats.total ? 'opacity-70' : ''}"
						aria-current={shownLevel.id === level.id ? 'true' : undefined}
						onclick={() => (selected = level.id)}
						data-testid="level-tab"
					>
						<span
							class="grid size-9 shrink-0 place-items-center rounded-xl font-bold {stats.mastered
								? 'bg-ok text-ok-fg'
								: 'bg-surface-2 text-accent'}">{level.id}</span
						>
						<span class="min-w-0 flex-1">
							<span class="block truncate font-medium">{level.title}</span>
							<span class="text-xs text-muted"
								>{stats.total
									? countText(stats)
									: level.units.length
										? `${level.units.length} units · lessons soon`
										: 'Coming later'}</span
							>
						</span>
					</button>
				{/each}
			</nav>
			<section class="min-w-0" aria-label="Level {shownLevel.id}">
				<div class="card mb-4">{@render levelHeader(shownLevel)}</div>
				{#if shownLevel.units.length}
					<div class="grid grid-cols-2 gap-4">
						{#each shownLevel.units as unit, i (unit.id)}
							<article class="card flex flex-col gap-2" data-testid="unit" data-unit={unit.id}>
								<h3 class="flex items-center gap-2 text-lg font-semibold">
									<span
										class="grid size-7 place-items-center rounded-full bg-surface-2 text-sm text-muted"
										>{i + 1}</span
									>{unit.title}
								</h3>
								{@render unitBody(unit)}
							</article>
						{/each}
					</div>
				{:else}
					<p class="text-muted">This level's lessons arrive in a later update.</p>
				{/if}
			</section>
		</div>
	{:else}
		<!-- Phone: one vertical path, level by level; levels collapse to their header. -->
		<ol class="flex flex-col gap-6" data-testid="learn-path">
			{#each index.levels as level (level.id)}
				{@const open = isOpen(level.id)}
				<li class={!level.units.length ? 'opacity-70' : ''}>
					<section aria-label="Level {level.id}" data-testid="level" data-open={open}>
						{#if level.units.length}
							<div class="relative">
								{@render levelHeader(level, open)}
								<!-- The whole header is the toggle. -->
								<button
									class="absolute inset-0 rounded-2xl"
									aria-expanded={open}
									aria-label="Level {level.id}: {open ? 'hide' : 'show'} lessons"
									onclick={() => (toggled[level.id] = !open)}
									data-testid="level-toggle"
								></button>
							</div>
						{:else}
							{@render levelHeader(level)}
						{/if}
						{#if level.units.length && open}
							<ol class="relative mt-4 ml-6 flex flex-col gap-5 border-l-2 border-line pl-5">
								{#each level.units as unit (unit.id)}
									{@const lessons = byUnit.get(unit.id) ?? []}
									{@const done = lessons.filter((l) => isDone(stateOf(progress, l.id))).length}
									<li class="relative" data-testid="unit" data-unit={unit.id}>
										<span
											class="absolute top-1 -left-[1.95rem] size-4 rounded-full border-2 {lessons.length &&
											lessons.every((l) => stateOf(progress, l.id) === 'mastered')
												? 'border-ok bg-ok'
												: done
													? 'border-accent bg-accent'
													: 'border-line bg-bg'}"
											aria-hidden="true"
										></span>
										<h3 class="mb-1.5 text-lg leading-tight font-semibold">{unit.title}</h3>
										{@render unitBody(unit)}
									</li>
								{/each}
							</ol>
						{/if}
					</section>
				</li>
			{/each}
		</ol>
	{/if}
</main>
