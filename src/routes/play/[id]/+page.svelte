<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { onDestroy } from 'svelte';
	import SheetView from '$lib/sheet/SheetView.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import TabPlayer, { type PlayerPrefs } from '$lib/player/TabPlayer.svelte';
	import { sendJson } from '$lib/api';
	import { fromLesson } from '$lib/learn/from';

	let { data } = $props();

	const song = $derived(data.song);
	/** A chord sheet shows as one (its accompaniment plays); ?view=tab opens its tab, if any. */
	const view = $derived(
		song.sheet && !(song.hasTab && page.url.searchParams.get('view') === 'tab') ? 'sheet' : 'tab'
	);
	const p = $derived(data.progress);
	/** A lesson's ::song card suggests a tempo (?tempo=80, % of the score's) and links back. */
	const suggested = $derived.by(() => {
		const t = Number(page.url.searchParams.get('tempo'));
		return Number.isInteger(t) && t >= 25 && t <= 150 ? t : null;
	});
	const tempoPct = $derived(suggested ?? p?.tempoPct ?? 100);
	const lessonFrom = $derived(fromLesson(page.url));
	const initialLoop = $derived(
		p && p.loopStartBar !== null && p.loopEndBar !== null
			? { start: p.loopStartBar, end: p.loopEndBar }
			: null
	);

	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let pending: (() => void) | undefined;

	function flush() {
		clearTimeout(saveTimer);
		pending?.();
		pending = undefined;
	}

	function save(prefs: PlayerPrefs, played = false) {
		clearTimeout(saveTimer);
		pending = undefined;
		// Captured now: the debounced send must not write to a song navigated to in the meantime.
		const id = song.id;
		const body = {
			tempoPct: prefs.tempoPct,
			loopStartBar: prefs.loop?.start ?? null,
			loopEndBar: prefs.loop?.end ?? null,
			played
		};
		const send = () =>
			sendJson(`/api/songs/${encodeURIComponent(id)}/progress`, 'PUT', body, {
				keepalive: true
			}).catch(() => {
				// offline: progress is best-effort for now (offline queue comes later)
			});
		// Debounce slider drags; playback starts are saved right away.
		if (played) send();
		else {
			pending = send;
			saveTimer = setTimeout(flush, 400);
		}
	}

	// Leaving the page (or switching song): send what is pending rather than dropping it.
	onDestroy(flush);
</script>

<svelte:head><title>{song.title} · Self-Guitar</title></svelte:head>

<div class="flex h-dvh flex-col">
	<PageHeader
		bar
		theme={false}
		title={song.title}
		subtitle="{song.composer} · Level {song.level} · {song.key}"
		back={lessonFrom
			? { href: `${base}/learn/${lessonFrom}`, label: 'Back to the lesson' }
			: { href: `${base}/library`, label: 'Back to library' }}
	>
		{#snippet actions()}
			{#if song.sheet && song.hasTab}
				<span class="mr-1 flex rounded-xl bg-surface-2 p-0.5" role="group" aria-label="View">
					<a
						href="?view=sheet"
						class="rounded-lg px-2.5 py-1.5 text-sm font-medium {view === 'sheet'
							? 'bg-surface shadow'
							: 'text-muted'}"
						aria-current={view === 'sheet' ? 'page' : undefined}
						data-testid="view-sheet">Chords</a
					>
					<a
						href="?view=tab"
						class="rounded-lg px-2.5 py-1.5 text-sm font-medium {view === 'tab'
							? 'bg-surface shadow'
							: 'text-muted'}"
						aria-current={view === 'tab' ? 'page' : undefined}
						data-testid="view-tab">Tab</a
					>
				</span>
			{/if}
		{/snippet}
	</PageHeader>
	{#key `${song.id}:${view}`}
		{#if view === 'sheet' && song.sheet}
			<SheetView
				sheet={song.sheet}
				id={song.id}
				initialTempoPct={tempoPct}
				onchange={(prefs) => save({ ...prefs, loop: song.hasTab ? initialLoop : null })}
				onplay={(prefs) => save({ ...prefs, loop: song.hasTab ? initialLoop : null }, true)}
			/>
		{:else}
			<TabPlayer
				tex={song.tex}
				initialTempoPct={tempoPct}
				{initialLoop}
				onchange={(prefs) => save(prefs)}
				onplay={(prefs) => save(prefs, true)}
			/>
		{/if}
	{/key}
</div>
