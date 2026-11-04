<script lang="ts">
	// The ear trainer: intervals (up, down, together), chord quality, progressions by Roman
	// numeral, and "play it back" on the guitar (mic). Choices grow with accuracy; every answer is
	// stored and per-item accuracy shows below. ?kind=intervals&set=P4,P5,P8&dir=asc presets it.
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import ToolHeader from '$lib/components/ToolHeader.svelte';
	import EarQuiz from '$lib/ear/EarQuiz.svelte';
	import PlaybackDrill from '$lib/ear/PlaybackDrill.svelte';
	import {
		DEFAULT_SET,
		DIR_LABEL,
		EAR_DIRS,
		EAR_ITEMS,
		EAR_KINDS,
		EAR_TITLE,
		PROGRESSION_KEYS,
		isEarKind,
		orderSet,
		parseEarSet,
		type EarDir,
		type EarKind
	} from '$lib/ear/items';
	import type { ItemStats } from '$lib/ear/trainer';

	let kind = $state<EarKind>('intervals');
	let sets = $state<Record<EarKind, string[]>>({ ...DEFAULT_SET });
	let dir = $state<EarDir>('asc');
	let key = $state('C');
	let editing = $state(false);
	let stats = $state<ItemStats>({});
	/** The quiz's unlocked choices: the other items of the set show as locked. */
	let active = $state<string[] | null>(null);
	let fixedNote = $state<string | null>(null);
	let ready = $state(false);

	onMount(() => {
		const q = page.url.searchParams;
		const k = q.get('kind') ?? '';
		if (isEarKind(k)) kind = k;
		const s = q.get('set');
		if (s) {
			const problems: string[] = [];
			const parsed = parseEarSet(kind, s, problems);
			if (!problems.length) sets[kind] = parsed;
		}
		const d = q.get('dir') as EarDir | null;
		if (d && EAR_DIRS.includes(d)) dir = d;
		const kk = q.get('key');
		if (kk && (kk === 'random' || (PROGRESSION_KEYS as readonly string[]).includes(kk))) key = kk;
		const note = q.get('note');
		if (note && EAR_ITEMS.playback.some((i) => i.id === note)) fixedNote = note;
		ready = true;
	});

	$effect(() => {
		if (!ready) return;
		const from = page.url.searchParams.get('from');
		const params = new URLSearchParams({
			kind,
			...(sets[kind].join(',') !== DEFAULT_SET[kind].join(',') && { set: sets[kind].join(',') }),
			...(kind === 'intervals' && { dir }),
			...(kind === 'progressions' && { key }),
			...(from && { from })
		});
		const next = `${page.url.pathname}?${params}`;
		if (next !== page.url.pathname + page.url.search)
			try {
				replaceState(next, {});
			} catch {
				// router not ready
			}
	});

	function toggle(id: string) {
		const s = sets[kind];
		const next = s.includes(id) ? s.filter((x) => x !== id) : orderSet(kind, [...s, id]);
		if (next.length >= 2) sets[kind] = next;
	}

	const items = $derived(EAR_ITEMS[kind]);
	const SHORT_TITLE: Record<EarKind, string> = {
		intervals: 'Intervals',
		chords: 'Chords',
		progressions: 'Chord I–V',
		playback: 'Play back'
	};
	const set = $derived(sets[kind]);
	const pct = (s: { total: number; correct: number } | undefined) =>
		s && s.total ? Math.round((s.correct / s.total) * 100) : null;
</script>

<svelte:head><title>Ear trainer · Self-Guitar</title></svelte:head>

<main class="mx-auto w-full max-w-3xl px-3 py-2 md:p-8">
	<ToolHeader title="Ear trainer" />

	<div class="mb-2 grid grid-cols-4 gap-1 sm:flex sm:gap-1.5" role="group" aria-label="Mode">
		{#each EAR_KINDS as k (k)}
			<button
				class="btn min-h-10 rounded-full px-1.5 text-[15px] sm:shrink-0 sm:px-3.5"
				aria-pressed={kind === k}
				onclick={() => {
					if (kind === k) return;
					kind = k;
					editing = false;
					stats = {};
					active = null;
				}}
				data-testid="ear-tab-{k}"
				><span class="sm:hidden">{SHORT_TITLE[k]}</span><span class="hidden sm:inline"
					>{EAR_TITLE[k]}</span
				></button
			>
		{/each}
	</div>

	{#if kind !== 'playback'}
		<div class="mb-2 flex flex-wrap items-center gap-1.5">
			<button
				class="btn min-h-10 px-3"
				aria-expanded={editing}
				onclick={() => (editing = !editing)}
				aria-label="Choose the set"
				data-testid="ear-set-toggle"><Icon name="gear" size={18} />Set</button
			>
			{#if kind === 'intervals'}
				<div class="segmented flex-1 sm:max-w-xs" role="group" aria-label="Direction">
					{#each EAR_DIRS as d (d)}
						<button aria-pressed={dir === d} onclick={() => (dir = d)} data-testid="ear-dir-{d}"
							>{DIR_LABEL[d]}</button
						>
					{/each}
				</div>
			{:else if kind === 'progressions'}
				<label class="flex items-center gap-1.5 text-sm text-muted"
					>Key
					<select class="field min-h-10 py-0 text-fg" bind:value={key} data-testid="ear-key">
						{#each PROGRESSION_KEYS as k (k)}<option value={k}>{k}</option>{/each}
						<option value="random">Any</option>
					</select>
				</label>
			{/if}
		</div>
		{#if editing}
			<div class="card mb-2 flex flex-wrap gap-1.5" data-testid="ear-set">
				{#each items as it (it.id)}
					<button
						class="btn min-h-10 rounded-full px-3"
						aria-pressed={set.includes(it.id)}
						onclick={() => toggle(it.id)}
						data-testid="ear-set-item"
						data-item={it.id}>{it.label}</button
					>
				{/each}
				<p class="w-full text-xs text-muted">At least two. Choices start with the first two.</p>
			</div>
		{/if}
		{#key `${kind}|${set.join(',')}|${dir}|${key}`}
			<EarQuiz
				{kind}
				{set}
				{dir}
				{key}
				onstats={(s) => (stats = s)}
				onchoices={(c) => (active = c)}
			/>
		{/key}
	{:else}
		<PlaybackDrill fixed={fixedNote} onstats={(s) => (stats = s)} />
	{/if}

	<section class="mt-4" aria-label="Accuracy per item" data-testid="ear-stats">
		<h2 class="mb-1.5 text-sm font-semibold text-muted">Your accuracy</h2>
		<ul class="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
			{#each items.filter((i) => kind === 'playback' || set.includes(i.id)) as it (it.id)}
				{@const s = stats[it.id]}
				{@const p = pct(s)}
				{@const isLocked = kind !== 'playback' && !!active && !active.includes(it.id)}
				<li
					class="text-sm {isLocked ? 'opacity-55' : ''}"
					data-testid="ear-stat"
					data-item={it.id}
					data-total={s?.total ?? 0}
					data-locked={isLocked}
				>
					<div class="flex items-baseline justify-between gap-2">
						<span class="flex items-center gap-1 font-medium"
							>{#if isLocked}<Icon name="lock" size={13} />{/if}{it.label}</span
						>
						<span class="text-xs text-muted tabular-nums"
							>{isLocked && !s
								? 'locked'
								: `${s ? `${s.correct}/${s.total}` : '–'}${p !== null ? ` · ${p}%` : ''}`}</span
						>
					</div>
					<div class="mt-0.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
						<div
							class="h-full rounded-full {p !== null && p >= 80 ? 'bg-ok' : 'bg-accent'}"
							style:width="{p ?? 0}%"
						></div>
					</div>
				</li>
			{/each}
		</ul>
	</section>
</main>
