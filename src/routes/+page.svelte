<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { getAudioContext } from '$lib/audio/context';
	import { barNumber } from '$lib/progress';
	import GoalSettings from '$lib/session/GoalSettings.svelte';
	import WeeklyRing from '$lib/session/WeeklyRing.svelte';
	import { KIND } from '$lib/session/labels';
	import {
		activeSession,
		api,
		newSession,
		saveLocal,
		setLength,
		storedSession,
		type LocalSession
	} from '$lib/session/client';
	import { loadPlan, type PlanSource } from '$lib/session/today';
	import { SESSION_LENGTHS, type Plan, type Settings } from '$lib/session/types';

	let { data } = $props();
	const last = $derived(data.continue);
	const lesson = $derived(data.nextLesson);

	// Local copies, replaced when the length changes (and by new page data).
	let minutes = $derived(data.minutes);
	let plan = $derived<Plan>(data.plan);
	let source = $derived<PlanSource>(data.source);
	let loading = $state(false);
	let starting = $state(false);
	let startError = $state('');
	let settingsOpen = $state(false);
	let active = $state<LocalSession | null>(null);
	/** Today's finished session (this device, else the server): the "done for today" recap. */
	let done = $state<{ minutes: number; titles: string[] } | null>(null);
	/** "Practise more" after today's session: the plan comes back. */
	let more = $state(false);
	let ready = $state(false);

	onMount(() => {
		active = activeSession();
		const local = storedSession();
		const ended =
			local && local.date === data.date && local.endedAt
				? { blocks: local.blocks, results: local.results }
				: data.todaySession?.endedAt
					? data.todaySession
					: null;
		if (ended && !active)
			done = {
				minutes: Math.round(ended.results.reduce((a, r) => a + (r?.actualSec ?? 0), 0) / 60),
				titles: ended.blocks.filter((_, i) => ended.results[i]?.completed).map((b) => b.title)
			};
		ready = true;
	});

	async function choose(m: number) {
		if (m === minutes) return;
		minutes = m;
		setLength(m);
		loading = true;
		const res = await loadPlan(fetch, m, lesson?.id ?? null);
		if (minutes === m) ({ plan, source } = res);
		loading = false;
	}

	async function start() {
		if (!plan.blocks.length) return;
		// Inside the tap: iOS only lets audio start from a gesture (the time-up chime needs it).
		getAudioContext();
		starting = true;
		startError = '';
		const s = newSession(plan, data.date);
		saveLocal(s);
		// Stored on the server now, or queued when offline: the runner works either way.
		const res = await api.start(s, plan.minutes);
		if (res.status === 'rejected') {
			saveLocal(null);
			starting = false;
			startError = `Could not start the session${res.message ? `: ${res.message}` : ''}. Reload and try again.`;
			return;
		}
		await goto('/session');
	}

	async function saveSettings(s: Settings) {
		const res = await fetch('/api/settings', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(s)
		}).catch(() => null);
		if (!res?.ok) throw new Error('Could not save the goal. Are you online?');
		setLength(s.sessionMin);
		await invalidateAll();
	}

	const blockMin = $derived(plan.blocks.reduce((a, b) => a + b.minutes, 0));
	const showPlan = $derived(!active && (!done || more));
	const greeting = (() => {
		const h = new Date().getHours();
		return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
	})();
	const today = new Date().toLocaleDateString(undefined, {
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	});
</script>

<svelte:head><title>Today · Self-Guitar</title></svelte:head>

<main class="mx-auto w-full max-w-5xl p-4 md:p-8">
	<header class="mb-4 flex items-center gap-2">
		<div class="min-w-0 flex-1">
			<h1 class="text-2xl font-bold">Today</h1>
			<p class="text-sm text-muted">{greeting} · {today}</p>
		</div>
		<button
			class="btn bg-transparent!"
			aria-label="Weekly goal settings"
			onclick={() => (settingsOpen = true)}
			disabled={!data.goals}
			data-testid="goal-settings-open"><Icon name="gear" /></button
		>
		<div class="md:hidden"><ThemeToggle /></div>
	</header>

	<!-- Phone: start, week, plan, links. Wide: start and plan on the left, the rest on the right. -->
	<div
		class="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,1fr)_20rem] md:grid-rows-[auto_auto_1fr] md:items-start lg:grid-cols-[minmax(0,1fr)_22rem]"
	>
		<!-- Start: the one thing to do here. -->
		<section
			class="card flex min-w-0 flex-col gap-4 border-accent! md:col-start-1 md:row-start-1"
			data-testid="start-card"
			data-ready={ready}
		>
			{#if active}
				<div>
					<p class="text-sm font-medium text-muted">Session in progress</p>
					<p class="text-xl font-semibold">
						Block {Math.min(active.idx + 1, active.blocks.length)} of {active.blocks.length}
						· {KIND[active.blocks[Math.min(active.idx, active.blocks.length - 1)].kind].label}
					</p>
				</div>
				<a href="/session" class="btn btn-primary min-h-16 text-xl" data-testid="resume-session"
					><Icon name="play" size={28} />Resume session</a
				>
			{:else if done && !more}
				<div class="flex items-start gap-3" data-testid="done-today">
					<span class="rounded-full bg-ok p-2 text-ok-fg"><Icon name="check" size={28} /></span>
					<div class="min-w-0 flex-1">
						<p class="text-xl font-semibold">Done for today</p>
						<p class="text-muted">
							{done.minutes} min played{done.titles.length ? ':' : '.'}
						</p>
						{#if done.titles.length}
							<ul class="mt-1 flex flex-col gap-0.5 text-sm" data-testid="done-today-recap">
								{#each done.titles as t, i (i)}
									<li class="flex gap-1.5"><span class="text-ok">✓</span>{t}</li>
								{/each}
							</ul>
						{/if}
					</div>
				</div>
				<button class="btn min-h-12" onclick={() => (more = true)} data-testid="practise-more"
					><Icon name="plus" />Practise more</button
				>
			{:else}
				{#if data.firstTime}
					<div class="flex flex-col gap-1" data-testid="welcome">
						<p class="text-xl font-semibold">Welcome! Grab your guitar.</p>
						<p class="text-muted">
							Each day the app plans a short session for you: a warm-up, one new thing, a little
							technique and a song. Tap Start for your first {minutes}-minute session and follow
							along; it tells you what to do next.
						</p>
					</div>
				{/if}
				<div class="flex flex-col gap-2">
					<p class="text-sm font-medium text-muted" id="length-label">
						{done ? 'A bit more? Pick a length' : 'How many minutes today?'}
					</p>
					<div class="segmented" role="group" aria-labelledby="length-label">
						{#each SESSION_LENGTHS as m (m)}
							<button
								aria-pressed={minutes === m}
								onclick={() => choose(m)}
								data-testid="length-{m}"
								aria-label="{m} minutes">{m}</button
							>
						{/each}
					</div>
				</div>
				<button
					class="btn btn-primary min-h-16 text-xl shadow-lg"
					onclick={start}
					disabled={starting || loading || !plan.blocks.length}
					data-testid="start-session"
					><Icon name="play" size={28} />Start {minutes}-min session</button
				>
				{#if startError}
					<p class="text-sm text-danger" role="alert" data-testid="start-error">{startError}</p>
				{/if}
			{/if}
		</section>

		{#if data.goals}
			<section
				class="card min-w-0 md:col-start-2 md:row-span-2 md:row-start-1"
				aria-labelledby="week-title"
			>
				<div class="mb-3 flex items-center justify-between">
					<h2 id="week-title" class="font-semibold">This week</h2>
					<a href="/progress" class="text-sm text-accent" data-testid="progress-link">Progress →</a>
				</div>
				<WeeklyRing goals={data.goals} />
			</section>
		{/if}

		<!-- Today's plan. -->
		{#if showPlan}
			<section
				class="min-w-0 md:col-start-1 md:row-span-2 md:row-start-2"
				aria-labelledby="plan-title"
				data-testid="plan"
				data-source={source}
			>
				<div class="mb-2 flex items-baseline justify-between gap-2">
					<h2 id="plan-title" class="text-lg font-semibold">Today’s plan</h2>
					<span class="text-sm text-muted tabular-nums"
						>{blockMin} min · {plan.blocks.length} blocks</span
					>
				</div>
				{#if source !== 'server'}
					<p class="mb-2 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted" role="status">
						Offline: {source === 'cached'
							? 'your last plan for this length.'
							: 'a simple plan from saved lessons and songs.'} Results sync when you are back online.
					</p>
				{/if}
				<ol class="flex flex-col gap-2 transition-opacity {loading ? 'opacity-50' : ''}">
					{#each plan.blocks as b, i (i)}
						<li class="card flex items-start gap-3 p-3" data-testid="plan-block" data-kind={b.kind}>
							<span class="mt-0.5 rounded-xl bg-surface-2 p-2 text-accent"
								><Icon name={KIND[b.kind].icon} size={20} /></span
							>
							<span class="min-w-0 flex-1">
								<span class="block text-xs font-medium tracking-wide text-muted uppercase"
									>{KIND[b.kind].label}</span
								>
								<span class="line-clamp-2 block leading-snug font-semibold">{b.title}</span>
								<span class="block text-sm text-muted">{b.why}</span>
							</span>
							<span class="chip shrink-0 tabular-nums">{b.minutes} min</span>
						</li>
					{/each}
				</ol>
			</section>
		{/if}

		<div class="flex min-w-0 flex-col gap-4 md:col-start-2 md:row-start-3">
			<div class="grid {plan.due ? 'grid-cols-2' : 'grid-cols-1'} gap-2 md:grid-cols-1">
				<a
					href={lesson ? `/learn/${lesson.id}` : '/learn'}
					class="card flex min-h-20 items-center gap-3 p-3 hover:bg-surface-2"
					data-testid="learn-entry"
				>
					<span class="rounded-xl bg-surface-2 p-2 text-accent"><Icon name="learn" /></span>
					<span class="min-w-0 flex-1">
						<span class="block text-xs text-muted"
							>{lesson
								? `${data.lessonStarted ? 'Continue lesson' : 'Next lesson'} · L${lesson.level}`
								: 'Learn'}</span
						>
						<span class="line-clamp-2 leading-tight font-semibold" data-testid="learn-entry-title"
							>{lesson ? lesson.title : 'Skill tree'}</span
						>
					</span>
				</a>
				{#if plan.due}
					<a
						href="/progress#skills"
						class="card flex min-h-20 items-center gap-3 p-3 hover:bg-surface-2"
						data-testid="due-link"
					>
						<span class="rounded-xl bg-surface-2 p-2 text-accent"><Icon name="loop" /></span>
						<span class="min-w-0 flex-1">
							<span class="block text-xs text-muted">Due for review</span>
							<span class="text-xl font-semibold tabular-nums" data-testid="due-count"
								>{plan.due}</span
							>
							<span class="text-sm text-muted">{plan.due === 1 ? 'skill' : 'skills'}</span>
						</span>
					</a>
				{/if}
			</div>

			{#if last}
				<a
					href="/play/{last.songId}"
					class="card flex items-center gap-3 p-3 hover:bg-surface-2"
					data-testid="continue-card"
				>
					<span class="rounded-xl bg-surface-2 p-2 text-accent"><Icon name="play" /></span>
					<span class="min-w-0 flex-1">
						<span class="block text-xs text-muted">Continue song</span>
						<span class="block truncate font-semibold">{last.title}</span>
						<span class="mt-1 flex flex-wrap gap-1">
							<span class="chip">Tempo {last.tempoPct}%</span>
							{#if last.loopStartBar !== null && last.loopEndBar !== null}
								<span class="chip"
									>Loop bars {barNumber(last.loopStartBar, last.pickup)}–{barNumber(
										last.loopEndBar,
										last.pickup
									)}</span
								>
							{/if}
						</span>
					</span>
				</a>
			{/if}

			<nav class="grid grid-cols-2 gap-2" aria-label="More">
				<a
					href="/library"
					class="card flex min-h-14 items-center gap-2 p-3 hover:bg-surface-2"
					data-testid="library-entry"
					><Icon name="library" /><span class="font-medium">Library</span></a
				>
				<a
					href="/tools"
					class="card flex min-h-14 items-center gap-2 p-3 hover:bg-surface-2"
					data-testid="tools-entry"><Icon name="tools" /><span class="font-medium">Tools</span></a
				>
			</nav>

			<p class="text-sm text-muted">
				<a class="underline" href="/about/attributions">Content attributions &amp; licenses</a>
			</p>
		</div>
	</div>
</main>

{#if settingsOpen && data.goals}
	<GoalSettings
		settings={data.goals.settings}
		onsave={saveSettings}
		onclose={() => (settingsOpen = false)}
	/>
{/if}
