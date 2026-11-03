<script lang="ts">
	const fingers = [
		{ n: 1, name: 'Index' },
		{ n: 2, name: 'Middle' },
		{ n: 3, name: 'Ring' },
		{ n: 4, name: 'Pinky' }
	];
</script>

<ul class="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted" aria-label="Finger colours">
	{#each fingers as f (f.n)}
		<li class="flex items-center gap-1.5">
			<span
				class="inline-flex size-5 items-center justify-center rounded-full text-xs font-bold"
				style="background: var(--finger-{f.n}); color: var(--finger-text)">{f.n}</span
			>{f.name}
		</li>
	{/each}
</ul>
