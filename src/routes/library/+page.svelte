<script lang="ts">
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { PLAYS, STYLES } from '$lib/content/schema';
	import { CHANGE_CHORDS } from '$lib/chords';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import {
		baseChord,
		byLevelGroups,
		exerciseGroups,
		filterSongs,
		myLevel as readerLevel,
		nearLevels,
		SORTS,
		TABS,
		taughtChords,
		warmupGroups,
		type Sort,
		type Tab
	} from '$lib/library';
	import { barNumber } from '$lib/progress';

	let { data } = $props();

	const TAB_LABEL: Record<Tab, string> = {
		songs: 'Songs',
		warmups: 'Warm-ups',
		exercises: 'Exercises'
	};
	/** "My chords" (the chords the reader knows), remembered on this device. */
	const MY_CHORDS_KEY = 'sg:my-chords';

	// Filters, search and tab live in the URL: coming back from a song finds the list as it was.
	const sp = $derived(page.url.searchParams);
	const tab = $derived<Tab>(
		(TABS as readonly string[]).includes(sp.get('tab') ?? '') ? (sp.get('tab') as Tab) : 'songs'
	);
	/** The search box (typed ahead of the URL, which follows it). */
	let query = $state(untrack(() => page.url.searchParams.get('q') ?? ''));
	const level = $derived.by<number | 'all' | 'near'>(() => {
		const v = sp.get('level');
		return v === null
			? 'near'
			: v === 'all'
				? 'all'
				: Number.isInteger(Number(v))
					? Number(v)
					: 'near';
	});
	const style = $derived(sp.get('style') ?? 'all');
	const kind = $derived((sp.get('kind') ?? 'all') as 'all' | 'sheet' | 'tab');
	const play = $derived(sp.get('play') ?? 'all');
	const sort = $derived<Sort>(
		(sp.get('sort') as Sort) in SORTS ? (sp.get('sort') as Sort) : 'level'
	);
	const mine = $derived(sp.get('mine') === '1');

	/** Sets URL parameters (a default value removes it); the list re-filters from the URL. */
	function setParams(next: Record<string, string | null>) {
		const url = new URL(page.url);
		for (const [k, v] of Object.entries(next)) {
			if (v === null) url.searchParams.delete(k);
			else url.searchParams.set(k, v);
		}
		goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}
	const setTab = (t: Tab) => setParams({ tab: t === 'songs' ? null : t });

	let showLater = $state(false);
	let pickerOpen = $state(false);

	const me = $derived(readerLevel(data.index, data.learn));
	const [nearLo, nearHi] = $derived(nearLevels(me));
	const taught = $derived(taughtChords(data.index, data.learn));
	function readMine(): string[] | null {
		try {
			const v = localStorage.getItem(MY_CHORDS_KEY);
			const parsed = v ? (JSON.parse(v) as unknown) : null;
			return Array.isArray(parsed)
				? parsed.filter((c): c is string => typeof c === 'string')
				: null;
		} catch {
			return null;
		}
	}
	/** The reader's own list, or (until they edit it) the chords their completed lessons taught. */
	let saved = $state<string[] | null>(untrack(() => readMine()));
	const known = $derived(new Set(saved ?? taught));
	function saveMine(next: string[] | null) {
		saved = next;
		try {
			if (next === null) localStorage.removeItem(MY_CHORDS_KEY);
			else localStorage.setItem(MY_CHORDS_KEY, JSON.stringify(next));
		} catch {
			// a per-device convenience only
		}
	}
	function toggleChord(c: string) {
		saveMine(known.has(c) ? [...known].filter((x) => x !== c) : [...known, c]);
	}
	/** Every chord the chord sheets use, beginners' order first. */
	const allChords = $derived.by(() => {
		const used = new Set(
			data.songs.flatMap((s) => (s.chords ?? []).flatMap((c) => baseChord(c) ?? []))
		);
		const order = (c: string) => {
			const i = (CHANGE_CHORDS as readonly string[]).indexOf(c);
			return i < 0 ? 99 : i;
		};
		return [...used].sort((a, b) => order(a) - order(b) || a.localeCompare(b));
	});
	function myChordsChip() {
		if (!mine) {
			setParams({ mine: '1' });
			pickerOpen = true;
		} else pickerOpen = !pickerOpen;
	}

	const styles = $derived(STYLES.filter((st) => data.songs.some((s) => s.style === st)));
	const levels = $derived([...new Set(data.songs.map((s) => s.level))].sort((a, b) => a - b));
	const songs = $derived(
		filterSongs(
			data.songs,
			{ query, level, style, kind, play, sort, known: mine ? known : null, myLevel: me },
			data.progress
		)
	);
	const groups = $derived(sort === 'level' ? byLevelGroups(songs) : [{ level: -1, songs }]);
	const filtered = $derived(
		level !== 'all' || style !== 'all' || kind !== 'all' || play !== 'all' || mine || !!query
	);
	/** Warm-ups up to one level past the last level with lessons; the rest wait as "later". */
	const lessonLevel = $derived(Math.max(0, ...data.index.lessons.map((l) => l.level)));
	const warm = $derived(warmupGroups(data.index.warmups, lessonLevel + 1));
	const exGroups = $derived(exerciseGroups(data.index));
	const counts = $derived<Record<Tab, number>>({
		songs: data.songs.length,
		warmups: data.index.warmups.length,
		exercises: data.index.exercises.length
	});
	const PLAY_LABEL: Record<string, string> = {
		melody: 'Melody',
		chords: 'Strummed',
		fingerstyle: 'Fingerstyle'
	};
	function clear() {
		query = '';
		setParams({ q: null, level: 'all', style: null, kind: null, play: null, mine: null });
	}
</script>

<svelte:head><title>Library · Self-Guitar</title></svelte:head>

{#snippet sel(
	label: string,
	value: string,
	options: [string, string][],
	set: (v: string) => void,
	testid: string,
	on: boolean
)}
	<label class="relative shrink-0">
		<span class="sr-only">{label}</span>
		<select
			class="btn min-h-9 appearance-none rounded-full py-0 pr-7 pl-3 text-sm {on
				? 'bg-accent! text-accent-fg!'
				: ''}"
			{value}
			onchange={(e) => set(e.currentTarget.value)}
			data-testid={testid}
		>
			{#each options as [v, text] (v)}<option value={v}>{text}</option>{/each}
		</select>
		<span class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rotate-90 text-xs"
			><Icon name="forward" size={12} /></span
		>
	</label>
{/snippet}

<main class="mx-auto w-full max-w-5xl px-3 py-2 md:p-8">
	<PageHeader title="Library" />

	<div
		class="mb-2 grid grid-cols-3 gap-0.5 rounded-xl bg-surface-2 p-0.5"
		role="tablist"
		aria-label="Library"
	>
		{#each TABS as t (t)}
			<button
				role="tab"
				aria-selected={tab === t}
				class="min-h-10 rounded-lg text-sm font-semibold {tab === t
					? 'bg-surface text-fg shadow'
					: 'text-muted'}"
				onclick={() => setTab(t)}
				data-testid="tab-{t}"
				>{TAB_LABEL[t]} <span class="font-normal text-muted tabular-nums">{counts[t]}</span></button
			>
		{/each}
	</div>

	{#if tab === 'songs'}
		<div class="mb-2 flex flex-col gap-1.5">
			<label class="relative block">
				<span class="sr-only">Search by title, composer or chords</span>
				<span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">
					<Icon name="search" size={18} />
				</span>
				<input
					type="search"
					bind:value={query}
					oninput={() => setParams({ q: query || null })}
					placeholder="Search songs, composers, chords (G C D)"
					class="min-h-11 w-full rounded-xl border border-line bg-surface pr-3 pl-10 text-fg"
					data-testid="song-search"
				/>
			</label>
			<div
				class="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 pb-1 md:mx-0 md:flex-wrap md:px-0"
				data-testid="filters"
			>
				<button
					class="btn min-h-9 shrink-0 gap-1 rounded-full px-3 text-sm {mine
						? 'bg-accent! text-accent-fg!'
						: ''}"
					aria-expanded={pickerOpen}
					onclick={myChordsChip}
					data-testid="my-chords"
					data-on={mine}
					><Icon name="chords" size={16} />My chords
					<span class="tabular-nums opacity-80">{known.size}</span></button
				>
				<span class="flex shrink-0 items-center" data-testid="level-chip" data-level={level}>
					{@render sel(
						'Level',
						String(level),
						[
							['all', 'All levels'],
							['near', `Level ${nearLo}–${nearHi}`],
							...levels.map((l): [string, string] => [String(l), `Level ${l}`])
						],
						(v) => setParams({ level: v === 'near' ? null : v }),
						'filter-level',
						level !== 'all'
					)}
					{#if level !== 'all'}
						<button
							class="-ml-1 grid min-h-9 min-w-9 place-items-center rounded-full bg-accent text-accent-fg"
							aria-label="Show all levels"
							onclick={() => setParams({ level: 'all' })}
							data-testid="level-chip-clear"><Icon name="x" size={16} /></button
						>
					{/if}
				</span>
				{@render sel(
					'Style',
					style,
					[
						['all', 'All styles'],
						...styles.map((s): [string, string] => [s, s[0].toUpperCase() + s.slice(1)])
					],
					(v) => setParams({ style: v === 'all' ? null : v }),
					'filter-style',
					style !== 'all'
				)}
				{@render sel(
					'Kind',
					kind,
					[
						['all', 'Chords & tabs'],
						['sheet', 'Chord sheets'],
						['tab', 'Tabs']
					],
					(v) => setParams({ kind: v === 'all' ? null : v }),
					'filter-kind',
					kind !== 'all'
				)}
				{@render sel(
					'How it is played',
					play,
					[['all', 'Any playing'], ...PLAYS.map((p): [string, string] => [p, PLAY_LABEL[p]])],
					(v) => setParams({ play: v === 'all' ? null : v }),
					'filter-play',
					play !== 'all'
				)}
				<span class="ml-auto"></span>
				{@render sel(
					'Sort',
					sort,
					Object.entries(SORTS).map(([k, v]): [string, string] => [k, `Sort: ${v}`]),
					(v) => setParams({ sort: v === 'level' ? null : v }),
					'sort',
					false
				)}
			</div>
			{#if pickerOpen}
				<div class="card flex flex-col gap-2 p-3" data-testid="chord-picker">
					<div class="flex items-center gap-2">
						<p class="flex-1 text-sm">
							<b>Songs I can play</b>
							<span class="text-muted">· only these chords</span>
						</p>
						{#if mine}
							<button
								class="btn min-h-9 text-sm"
								onclick={() => {
									setParams({ mine: null });
									pickerOpen = false;
								}}
								data-testid="my-chords-off">Show all</button
							>
						{/if}
						<button
							class="btn btn-primary min-h-9 text-sm"
							onclick={() => (pickerOpen = false)}
							data-testid="my-chords-done">Done</button
						>
					</div>
					<ul class="flex flex-wrap gap-1.5" aria-label="Chords I know">
						{#each allChords as c (c)}
							<li>
								<button
									class="btn min-h-9 min-w-11 rounded-full px-2.5 font-bold"
									aria-pressed={known.has(c)}
									onclick={() => toggleChord(c)}
									data-testid="pick-chord"
									data-chord={c}>{c}</button
								>
							</li>
						{/each}
					</ul>
					<p class="text-xs text-muted">
						{saved ? 'Your own list.' : 'From the lessons you completed.'}
						{#if saved}<button
								class="text-accent underline"
								onclick={() => saveMine(null)}
								data-testid="my-chords-reset">Use my lessons' chords</button
							>{/if}
					</p>
				</div>
			{/if}
		</div>

		{#if songs.length === 0}
			<p class="text-muted">
				No songs match these filters. <button class="text-accent underline" onclick={clear}
					>Clear filters</button
				>
			</p>
		{:else if filtered}
			<p class="mb-1 text-xs text-muted" data-testid="song-count">
				{songs.length} of {data.songs.length} songs
			</p>
		{/if}
		{#each groups as g (g.level)}
			<section data-testid="song-group" data-level={g.level}>
				{#if g.level >= 0}
					<h2
						class="sticky top-0 z-10 -mx-3 bg-bg/95 px-3 py-1 text-xs font-semibold tracking-wider text-muted uppercase backdrop-blur md:mx-0 md:px-0"
						data-testid="level-header"
					>
						Level {g.level}
					</h2>
				{/if}
				<ul
					class="mb-2 grid grid-cols-[minmax(0,1fr)] gap-1.5 sm:grid-cols-[repeat(2,minmax(0,1fr))] sm:gap-2 lg:grid-cols-[repeat(3,minmax(0,1fr))]"
				>
					{#each g.songs as song (song.id)}
						{@const p = data.progress.get(song.id)}
						<li class="row min-w-0">
							<a
								href="{base}/play/{song.id}"
								class="card flex h-full items-center gap-2.5 px-3 py-2 hover:bg-surface-2"
								data-testid="song-card"
								data-kind={song.kind}
							>
								<span
									class="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-sm font-bold text-accent"
									title="Level {song.level}"
									aria-label="Level {song.level}">L{song.level}</span
								>
								<span class="min-w-0 flex-1">
									<span class="block truncate leading-snug font-semibold" data-testid="song-title"
										>{song.title}</span
									>
									<span class="sr-only"
										>Level {song.level} · {song.style[0].toUpperCase() + song.style.slice(1)} ·
									</span>
									<span class="mt-0.5 flex items-center gap-1 overflow-hidden text-xs">
										{#if song.kind === 'sheet'}
											<span class="chip chip-accent shrink-0 px-1.5 py-0" data-testid="kind-chip"
												>Chords</span
											>
										{/if}
										{#if song.hasTab}
											<span class="chip shrink-0 px-1.5 py-0 text-fg!" data-testid="kind-chip"
												>Tab</span
											>
											{#if song.level >= 3 && song.kind !== 'sheet'}
												<span class="chip shrink-0 px-1.5 py-0" data-testid="kind-chip"
													>Fingerstyle</span
												>
											{/if}
										{/if}
										{#if song.kind === 'sheet' && song.chords}
											{#each song.chords.slice(0, 6) as c (c)}
												<span
													class="shrink-0 rounded border border-line px-1 font-semibold {mine &&
													known.has(baseChord(c) ?? '')
														? 'text-ok'
														: ''}"
													data-testid="song-chord">{c}</span
												>
											{/each}
											{#if song.chords.length > 6}<span class="text-muted"
													>+{song.chords.length - 6}</span
												>{/if}
										{:else}
											<span class="truncate text-muted">{song.composer}</span>
										{/if}
									</span>
								</span>
								{#if p && (p.lastPlayedAt || p.tempoPct !== 100)}
									<span class="chip shrink-0 tabular-nums" data-testid="card-progress"
										>{p.tempoPct}%{p.loopStartBar !== null && p.loopEndBar !== null
											? ` · ${barNumber(p.loopStartBar, song.pickup)}–${barNumber(p.loopEndBar, song.pickup)}`
											: ''}</span
									>
								{/if}
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	{:else if tab === 'warmups'}
		<div class="flex flex-col gap-3" data-testid="warmup-groups">
			{#each warm.groups as g (g.goal)}
				<section>
					<h2 class="mb-1 text-xs font-semibold tracking-wider text-muted uppercase">{g.label}</h2>
					<ul class="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
						{#each g.items as w (w.id)}
							<li class="min-w-0">
								<a
									href="{base}/warmups/{w.id}"
									class="card flex h-full items-center gap-3 px-3 py-2 hover:bg-surface-2"
									data-testid="warmup-card"
								>
									<span
										class="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-sm font-bold text-accent"
										aria-label="Level {w.level}">L{w.level}</span
									>
									<span class="min-w-0 flex-1">
										<span class="block leading-snug font-semibold">{w.title}</span>
										<span class="block truncate text-xs text-muted">{w.howTo[0]}</span>
									</span>
									<span class="chip shrink-0 tabular-nums">{w.minutes} min</span>
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
			{#if warm.later.length}
				<button
					class="btn self-start text-sm"
					aria-expanded={showLater}
					onclick={() => (showLater = !showLater)}
					data-testid="warmups-later"
					>{showLater ? 'Hide' : 'Show'} {warm.later.length} for later levels</button
				>
				{#if showLater}
					<ul class="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
						{#each warm.later as w (w.id)}
							<li>
								<a
									href="{base}/warmups/{w.id}"
									class="card flex items-center gap-3 px-3 py-2 opacity-80 hover:bg-surface-2"
									data-testid="warmup-card"
									><span class="chip shrink-0">L{w.level}</span><span
										class="min-w-0 flex-1 font-semibold">{w.title}</span
									></a
								>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</div>
	{:else}
		<p class="mb-2 text-sm text-muted" data-testid="exercise-purpose">
			Drills from your lessons: each climbs from a slow tempo to its goal.
		</p>
		<div class="flex flex-col gap-3" data-testid="exercise-groups">
			{#each exGroups as g (g.level)}
				<section>
					<h2 class="mb-1 text-xs font-semibold tracking-wider text-muted uppercase">
						{g.level === 99 ? 'Other' : `Level ${g.level}`}
					</h2>
					<ul class="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
						{#each g.items as e (e.id)}
							{@const st = data.learn.exercises[e.id]}
							{@const at = st?.mastered ? e.targetBpm : (st?.best ?? null)}
							<li class="min-w-0">
								<a
									href="{base}/practice/exercise/{e.id}"
									class="card flex h-full flex-col gap-1 px-3 py-2 hover:bg-surface-2"
									data-testid="exercise-card"
								>
									<span class="flex items-center gap-2">
										<span class="min-w-0 flex-1 leading-snug font-semibold">{e.title}</span>
										{#if st?.mastered}
											<span class="chip shrink-0 bg-ok! text-ok-fg!" data-testid="exercise-status"
												><Icon name="check" size={12} />Mastered</span
											>
										{/if}
										<span
											class="shrink-0 text-xs text-muted tabular-nums"
											data-testid="exercise-bpm">{e.startBpm}→{e.targetBpm} BPM</span
										>
									</span>
									{#if at !== null}
										<span class="flex items-center gap-2" data-testid="exercise-progress">
											<span class="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
												<span
													class="block h-full rounded-full {st?.mastered ? 'bg-ok' : 'bg-accent'}"
													style:width="{Math.round(
														(100 * Math.max(0, Math.min(at, e.targetBpm) - e.startBpm)) /
															Math.max(1, e.targetBpm - e.startBpm)
													)}%"
												></span>
											</span>
											<span class="text-xs text-muted tabular-nums">best {at}</span>
										</span>
									{/if}
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	{/if}
</main>

<style>
	/* Long lists: rows off screen skip layout and paint (cheap with a couple of hundred songs). */
	.row {
		content-visibility: auto;
		contain-intrinsic-size: auto 60px;
	}
</style>
