<script lang="ts">
	import { base } from '$app/paths';
	import { onDestroy } from 'svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import TabPlayer, { type PlayerPrefs } from '$lib/player/TabPlayer.svelte';
	import { sendJson } from '$lib/api';

	let { data } = $props();

	const song = $derived(data.song);
	const p = $derived(data.progress);
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
		back={{ href: `${base}/library`, label: 'Back to library' }}
	/>
	{#key song.id}
		<TabPlayer
			tex={song.tex}
			initialTempoPct={p?.tempoPct ?? 100}
			{initialLoop}
			onchange={(prefs) => save(prefs)}
			onplay={(prefs) => save(prefs, true)}
		/>
	{/key}
</div>
