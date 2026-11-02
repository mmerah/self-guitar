<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Attributions · Self-Guitar</title></svelte:head>

<main class="mx-auto w-full max-w-3xl p-4 md:p-8">
	<h1 class="mb-2 text-2xl font-bold">Attributions</h1>
	<p class="mb-6 text-muted">Source and license of every content item bundled with this app.</p>

	<h2 class="mb-3 text-lg font-semibold">Songs</h2>
	<ul class="flex flex-col gap-3">
		{#each data.songs as song (song.id)}
			<li class="card text-sm">
				<div class="mb-1 text-base font-semibold">{song.title}</div>
				<dl class="grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1">
					<dt class="text-muted">Composer</dt>
					<dd>{song.composer}</dd>
					<dt class="text-muted">Arranger</dt>
					<dd>{song.arranger}</dd>
					<dt class="text-muted">Source</dt>
					<dd>{song.source}</dd>
					<dt class="text-muted">License</dt>
					<dd>{song.license}</dd>
					<dt class="text-muted">Attribution</dt>
					<dd>{song.attribution}</dd>
				</dl>
			</li>
		{/each}
	</ul>

	<h2 class="mt-8 mb-3 text-lg font-semibold">Software &amp; assets</h2>
	<ul class="card flex flex-col gap-2 text-sm">
		<li>
			<a class="underline" href="https://alphatab.net">alphaTab</a> — tab rendering and playback, MPL-2.0.
		</li>
		<li>SONiVOX SoundFont (bundled with alphaTab) — Apache-2.0.</li>
		<li>Bravura music font (bundled with alphaTab) — SIL Open Font License 1.1.</li>
	</ul>
</main>
