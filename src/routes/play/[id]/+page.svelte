<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { onDestroy } from 'svelte';
	import SheetView from '$lib/sheet/SheetView.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import TabPlayer, { type PlayerPrefs } from '$lib/player/TabPlayer.svelte';
	import { sendJson } from '$lib/api';
	import { fromLesson } from '$lib/learn/from';
	import { provideRecordItem } from '$lib/record/context';
	import {
		readSongView,
		SONG_VIEW_LABEL,
		SONG_VIEWS,
		texHasLyrics,
		writeSongView,
		type SongView
	} from '$lib/sheet/songView';

	let { data } = $props();

	const song = $derived(data.song);
	// The player's Rec control files takes under this song.
	provideRecordItem(() => ({ itemType: 'song', itemId: song.id, title: song.title }));
	/**
	 * A chord sheet shows as one (its accompaniment plays); ?view=tab opens a song's own score
	 * instead (the melody tab of a song that has both).
	 */
	const view = $derived(
		song.sheet && !(song.hasTab && page.url.searchParams.get('view') === 'tab') ? 'sheet' : 'tab'
	);
	/**
	 * Lyrics | Tab | Both: one choice for every song (remembered on this device). Switching keeps
	 * the player (and where it is) running: only the layout changes.
	 */
	let songView = $state<SongView>(readSongView());
	function pickView(v: SongView) {
		songView = v;
		writeSongView(v);
	}
	/** A score with lyrics of its own (\lyrics): Lyrics | Tab shows or hides them. */
	const scoreLyrics = $derived(!song.sheet && texHasLyrics(song.tex));
	const views = $derived<SongView[]>(
		view === 'sheet' ? SONG_VIEWS : scoreLyrics ? ['lyrics', 'tab'] : []
	);
	const shownView = $derived<SongView>(
		views.includes(songView) ? songView : songView === 'both' ? 'lyrics' : songView
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
			{#if views.length}
				<span
					class="mr-1 flex shrink-0 rounded-xl bg-surface-2 p-0.5"
					role="group"
					aria-label="Show"
					data-testid="song-view"
					data-view={shownView}
				>
					{#each views as v (v)}
						<button
							class="rounded-lg px-2 py-1.5 text-sm font-medium short:py-1 {shownView === v
								? 'bg-surface text-fg shadow'
								: 'text-muted'}"
							aria-pressed={shownView === v}
							onclick={() => pickView(v)}
							data-testid="song-view-{v}">{SONG_VIEW_LABEL[v]}</button
						>
					{/each}
				</span>
			{:else if song.sheet && song.hasTab}
				<!-- The song's own score (melody tab): back to its chord sheet. -->
				<a
					href="?view=sheet"
					class="btn mr-1 min-h-9 shrink-0 px-2.5 text-sm"
					data-testid="view-sheet">Chords</a
				>
			{/if}
		{/snippet}
	</PageHeader>
	{#key `${song.id}:${view}`}
		{#if view === 'sheet' && song.sheet}
			<SheetView
				sheet={song.sheet}
				id={song.id}
				mode={shownView}
				scoreHref={song.hasTab ? '?view=tab' : undefined}
				initialTempoPct={tempoPct}
				onchange={(prefs) => save({ ...prefs, loop: song.hasTab ? initialLoop : null })}
				onplay={(prefs) => save({ ...prefs, loop: song.hasTab ? initialLoop : null }, true)}
			/>
		{:else}
			<TabPlayer
				tex={song.tex}
				lyrics={shownView !== 'tab'}
				initialTempoPct={tempoPct}
				{initialLoop}
				onchange={(prefs) => save(prefs)}
				onplay={(prefs) => save(prefs, true)}
			/>
		{/if}
	{/key}
</div>
