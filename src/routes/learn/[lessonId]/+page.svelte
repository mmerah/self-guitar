<script lang="ts">
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { fromSession } from '$lib/learn/from';
	import { activeSession } from '$lib/session/client';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { loadLearnProgress, setLessonStatus } from '$lib/learn/client';
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
	// Embedded drills (ear quiz, fretboard quiz) store results as you go: the check sheet shows
	// the latest.
	$effect(() => {
		if (!sheet) return;
		const id = lesson.id;
		loadLearnProgress(fetch).then((p) => {
			if (id === lesson.id && p.lessons[id]) progress = p;
		});
	});
	/** Opened from a session block (directly, or back from a tool the lesson links). */
	let inSession = $state(false);
	onMount(() => {
		const s = activeSession();
		const t = s?.blocks[s.idx]?.target;
		inSession = fromSession(page.url) || (t?.type === 'lesson' && t.id === lesson.id);
	});
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
		if (data.next) await goto(`${base}/learn/${data.next.id}`);
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

<main class="mx-auto flex w-full max-w-6xl flex-1 flex-col px-3 pt-1 md:px-8 md:pt-6">
	<div class="lg:grid lg:grid-cols-[minmax(0,42rem)_18rem] lg:justify-center lg:gap-8">
		<article class="flex min-w-0 flex-col gap-3" data-testid="lesson" data-lesson={lesson.id}>
			<PageHeader
				title={lesson.title}
				subtitle="Level {lesson.level} · {place.unit.title} · {lesson.minutes} min{lesson.mastery
					? ` · ${MASTERY_LABEL[lesson.mastery.type]}`
					: ''}"
				back={{ href: `${base}/learn`, label: 'Back to Learn', testid: 'back-to-learn' }}
			/>

			<LessonBody
				blocks={lesson.blocks}
				exercises={data.exercises}
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
					<a href="{base}/learn/{data.prev.id}" class="card text-sm hover:bg-surface-2">
						<span class="block text-muted">Previous</span>
						<span class="font-medium">{data.prev.title}</span>
					</a>
				{/if}
			</div>
		</aside>
	</div>

	<!-- Room for the fixed action bar: it never covers the last widget. -->
	<div style:height="{barHeight}px" aria-hidden="true"></div>

	<!-- One row in thumb reach above the bottom nav: state, mastery check, Next. -->
	<div
		class="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 border-t border-line bg-bg/95 px-3 py-1 backdrop-blur md:bottom-0 md:left-20 md:px-8 md:pb-[max(0.25rem,env(safe-area-inset-bottom))]"
		bind:clientHeight={barHeight}
		data-testid="lesson-bar"
	>
		{#if problem}<p class="mb-1 text-sm text-danger" role="alert">{problem}</p>{/if}
		<div class="mx-auto flex max-w-2xl items-center gap-1.5">
			<span
				class="flex min-w-0 shrink items-center gap-1 text-xs font-semibold {lessonState ===
				'mastered'
					? 'text-ok'
					: isDone(lessonState)
						? 'text-accent'
						: 'text-muted'}"
				data-testid="lesson-bar-state"
				data-state={lessonState}
				title={STATE_TEXT[lessonState]}
				><span data-testid="lesson-state" data-state={lessonState}
					><StatusIcon value={lessonState} size="sm" /></span
				><span class="hidden truncate min-[380px]:inline">{BAR_TEXT[lessonState]}</span></span
			>
			{#if lesson.mastery}
				<button
					class="btn shrink-0 px-2.5 {mastery?.done ? 'text-ok' : ''}"
					onclick={() => (sheet = true)}
					aria-label={mastery?.done ? 'Mastery passed' : 'Check mastery'}
					title={mastery?.done ? 'Mastery passed' : 'Check mastery'}
					data-testid="mastery-open"
					><Icon name="star" size={20} /><span class="hidden sm:inline"
						>{mastery?.done ? 'Mastery passed' : 'Check mastery'}</span
					></button
				>
			{/if}
			{#if inSession}
				<a
					href="{base}/session"
					class="btn btn-primary min-w-0 flex-1"
					data-testid="back-to-session"><Icon name="back" />Back to session</a
				>
			{:else if data.next}
				<button
					class="btn btn-primary min-w-0 flex-1 justify-between"
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
					class="btn btn-primary min-w-0 flex-1"
					onclick={complete}
					disabled={saving}
					data-testid="mark-complete"><Icon name="check" />Mark complete</button
				>
			{:else}
				<a href="{base}/learn" class="btn btn-primary min-w-0 flex-1">Back to the skill tree</a>
			{/if}
		</div>
	</div>
</main>

{#if sheet && lesson.mastery}
	<MasteryCheck
		{lesson}
		mastery={lesson.mastery}
		status={mastery}
		exercises={data.exercises}
		onclose={() => (sheet = false)}
		onprogress={(p) => (progress = p)}
	/>
{/if}
