<script lang="ts">
	// ::song in a lesson: a link card to a library song at a suggested tempo.
	import { base } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import { loadSongList } from '$lib/api';
	import type { SongSummary } from '$lib/content/schema';

	let { id, tempo, label, from }: { id: string; tempo?: number; label?: string; from: string } =
		$props();

	let songs: Promise<SongSummary[]> | undefined;
	let song = $state<SongSummary | null>(null);
	$effect(() => {
		songs ??= loadSongList(fetch).catch(() => []);
		songs.then((list) => (song = list.find((s) => s.id === id) ?? null));
	});
	const href = $derived(
		`${base}/play/${id}?${new URLSearchParams({ ...(tempo && { tempo: String(tempo) }), from })}`
	);
</script>

<a
	{href}
	class="card flex min-h-20 items-center gap-3 p-3 hover:bg-surface-2"
	data-testid="lesson-song"
	data-song={id}
>
	<span class="rounded-2xl bg-surface-2 p-3 text-accent"><Icon name="play" size={28} /></span>
	<span class="min-w-0 flex-1">
		<span class="block text-lg leading-tight font-semibold">{label ?? song?.title ?? 'Song'}</span>
		<span class="block truncate text-sm text-muted"
			>{song ? `${song.key} · Level ${song.level}` : 'From the library'}{tempo
				? ` · at ${tempo}%`
				: ''}</span
		>
	</span>
	<Icon name="forward" />
</a>
