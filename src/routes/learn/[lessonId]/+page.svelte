<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import { setLessonStatus } from '$lib/learn/client';
	import LessonBody from '$lib/learn/LessonBody.svelte';
	import MasteryCheck from '$lib/learn/MasteryCheck.svelte';
	import StatusIcon from '$lib/learn/StatusIcon.svelte';
	import { isDone, MASTERY_LABEL, placeOf, skillName, stateOf } from '$lib/learn/tree';
	import type { LearnProgress } from '$lib/learn/types';

	let { data } = $props();
	const index = $derived(data.index);
	const lesson = $derived(data.lesson);
	const place = $derived(placeOf(index, lesson));

	// Local copy: replaced by every write's response (and by new page data).
	let progress = $derived<LearnProgress>(data.progress);
	const lessonState = $derived(stateOf(progress, lesson.id));
	const mastery = $derived(progress.lessons[lesson.id]?.mastery ?? null);

	let sheet = $state(false);
	let saving = $state(false);
	let problem = $state('');
	/** Height of the fixed action bar: the page keeps that much room below the last widget. */
	let barHeight = $state(0);

	// Opening a lesson marks it started.
	$effect(() => {
		const id = lesson.id;
		if (stateOf(data.progress, id) !== 'new') return;
		setLessonStatus(id, 'started')
			.then((p) => {
				if (id === lesson.id) progress = p;
			})
			.catch(() => {
				// offline: it will be marked when completed
			});
	});

	/** Marks the lesson completed; returns false (with a message) when that could not be saved. */
	async function complete() {
		saving = true;
		problem = '';
		try {
			progress = await setLessonStatus(lesson.id, 'completed');
			return true;
		} catch (e) {
			problem = (e as Error).message;
			return false;
		} finally {
			saving = false;
		}
	}

	/** The primary action: finishing this lesson and moving on are one step. */
	async function goNext() {
		if (!isDone(lessonState) && !(await complete())) return;
		if (data.next) await goto(`/learn/${data.next.id}`);
	}

	/** The bar's state label ("✓" marks what is finished; the icon carries the shape). */
	const BAR_TEXT = {
		new: 'Not started',
		started: 'In progress',
		completed: 'Completed',
		mastered: '✓ Mastered'
	};

	const STATE_TEXT = {
		new: 'Not started',
		started: 'In progress',
		completed: 'Completed',
		mastered: 'Mastered'
	};
</script>

<svelte:head><title>{lesson.title} · Self-Guitar</title></svelte:head>

<main class="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-3 md:px-8 md:pt-6">
	<div class="lg:grid lg:grid-cols-[minmax(0,42rem)_18rem] lg:justify-center lg:gap-8">
		<article class="flex min-w-0 flex-col gap-4" data-testid="lesson" data-lesson={lesson.id}>
			<header>
				<a
					href="/learn"
					class="-ml-1 inline-flex min-h-11 items-center gap-1 text-sm text-muted"
					data-testid="back-to-learn"
					><Icon name="back" size={18} />Level {lesson.level} · {place.unit.title}</a
				>
				<h1 class="text-3xl leading-tight font-bold">{lesson.title}</h1>
				<p class="mt-2 flex flex-wrap items-center gap-2">
					<span class="chip gap-1.5" data-testid="lesson-state" data-state={lessonState}
						><StatusIcon value={lessonState} size="sm" />{STATE_TEXT[lessonState]}</span
					>
					<span class="chip">{lesson.minutes} min</span>
					{#if lesson.mastery}
						<span class="chip">Mastery: {MASTERY_LABEL[lesson.mastery.type]}</span>
					{/if}
				</p>
			</header>

			<LessonBody
				blocks={lesson.blocks}
				exercises={index.exercises}
				stats={progress.exercises}
				{lesson}
			/>
		</article>

		<aside class="hidden lg:block">
			<div class="sticky top-6 flex flex-col gap-4">
				<section class="card">
					<h2 class="mb-2 text-sm font-semibold text-muted">Skills in this lesson</h2>
					<ul class="flex flex-col gap-2">
						{#each lesson.skills as id (id)}
							{@const st = progress.skills[id] ?? 'new'}
							<li class="flex items-center justify-between gap-2">
								<span>{skillName(index, id)}</span>
								<span class="chip {st === 'mastered' ? 'bg-ok! text-ok-fg!' : ''}">{st}</span>
							</li>
						{/each}
					</ul>
				</section>
				{#if data.prev}
					<a href="/learn/{data.prev.id}" class="card text-sm hover:bg-surface-2">
						<span class="block text-muted">Previous</span>
						<span class="font-medium">{data.prev.title}</span>
					</a>
				{/if}
			</div>
		</aside>
	</div>

	<!-- Room for the fixed action bar: it never covers the last widget. -->
	<div style:height="{barHeight}px" aria-hidden="true"></div>

	<!-- Actions in thumb reach above the bottom nav: state label, mastery check, Next. -->
	<div
		class="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 border-t border-line bg-bg/95 px-4 py-2 backdrop-blur md:bottom-0 md:left-20 md:px-8 md:pb-[max(0.75rem,env(safe-area-inset-bottom))] short:py-1 md:short:pb-1"
		bind:clientHeight={barHeight}
		data-testid="lesson-bar"
	>
		{#if problem}<p class="mb-1 text-sm text-danger" role="alert">{problem}</p>{/if}
		<div
			class="mx-auto flex max-w-2xl flex-wrap items-center gap-x-2 gap-y-1.5 sm:flex-nowrap short:flex-nowrap"
		>
			<!-- Phone portrait: state + mastery on one line, Next full width below. -->
			<div class="flex w-full items-center gap-2 sm:w-auto short:w-auto">
				<span
					class="flex min-w-0 items-center gap-1.5 text-sm font-semibold {lessonState === 'mastered'
						? 'text-ok'
						: isDone(lessonState)
							? 'text-accent'
							: 'text-muted'}"
					data-testid="lesson-bar-state"
					data-state={lessonState}
					><StatusIcon value={lessonState} size="sm" /><span class="truncate"
						>{BAR_TEXT[lessonState]}</span
					></span
				>
				{#if lesson.mastery}
					<button
						class="btn ml-auto min-h-10 shrink-0 px-3 text-sm sm:ml-0 short:min-h-9 {mastery?.done
							? 'bg-transparent! text-ok'
							: ''}"
						onclick={() => (sheet = true)}
						data-testid="mastery-open"
						><Icon name="star" size={18} />{mastery?.done
							? 'Mastery passed'
							: 'Check mastery'}</button
					>
				{/if}
			</div>
			{#if data.next}
				<button
					class="btn btn-primary min-h-12 w-full min-w-0 justify-between sm:w-auto sm:flex-1 short:min-h-10 short:w-auto short:flex-1"
					onclick={goNext}
					disabled={saving}
					data-testid="next-lesson"
					title="Next: {data.next.title}"
				>
					<span class="min-w-0 truncate"
						><span class="font-normal opacity-80">Next:</span> {data.next.title}</span
					><Icon name="forward" />
				</button>
			{:else if !isDone(lessonState)}
				<button
					class="btn btn-primary min-h-12 w-full sm:w-auto sm:flex-1 short:min-h-10 short:w-auto short:flex-1"
					onclick={complete}
					disabled={saving}
					data-testid="mark-complete"><Icon name="check" />Mark complete</button
				>
			{:else}
				<a
					href="/learn"
					class="btn btn-primary min-h-12 w-full sm:w-auto sm:flex-1 short:min-h-10 short:w-auto short:flex-1"
					>Back to the skill tree</a
				>
			{/if}
		</div>
	</div>
</main>

{#if sheet && lesson.mastery}
	<MasteryCheck
		{lesson}
		mastery={lesson.mastery}
		status={mastery}
		exercises={index.exercises}
		onclose={() => (sheet = false)}
		onprogress={(p) => (progress = p)}
	/>
{/if}
