<script lang="ts" module>
	export type MixerTrack = {
		index: number;
		name: string;
		mute: boolean;
		solo: boolean;
		volume: number;
	};
</script>

<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';

	let {
		tracks,
		onmute,
		onsolo,
		onvolume,
		onclose
	}: {
		tracks: MixerTrack[];
		onmute: (t: MixerTrack) => void;
		onsolo: (t: MixerTrack) => void;
		onvolume: (t: MixerTrack, volume: number) => void;
		onclose: () => void;
	} = $props();
</script>

<section aria-label="Mixer" class="flex flex-col gap-3">
	<header class="flex items-center justify-between">
		<h2 class="font-semibold">Mixer</h2>
		<button class="btn" onclick={onclose} aria-label="Close mixer"><Icon name="close" /></button>
	</header>
	{#each tracks as track (track.index)}
		<div class="rounded-xl bg-surface-2 p-3" data-testid="mixer-track">
			<div class="mb-2 flex items-center gap-2">
				<span class="min-w-0 flex-1 truncate font-medium">{track.name}</span>
				<button
					class="btn bg-surface!"
					aria-pressed={track.mute}
					aria-label="Mute {track.name}"
					onclick={() => onmute(track)}>Mute</button
				>
				<button
					class="btn bg-surface!"
					aria-pressed={track.solo}
					aria-label="Solo {track.name}"
					onclick={() => onsolo(track)}>Solo</button
				>
			</div>
			<label class="flex items-center gap-3 text-sm text-muted">
				Vol
				<input
					type="range"
					min="0"
					max="100"
					step="5"
					value={Math.round(track.volume * 100)}
					oninput={(e) => onvolume(track, Number(e.currentTarget.value) / 100)}
					class="h-11 flex-1 accent-(--accent)"
					aria-label="Volume {track.name}"
				/>
				<span class="w-10 text-right tabular-nums">{Math.round(track.volume * 100)}%</span>
			</label>
		</div>
	{/each}
</section>
