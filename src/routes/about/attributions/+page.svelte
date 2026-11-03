<script lang="ts">
	import { base } from '$app/paths';
	import thirdParty from '$lib/about/third-party.json';
	import { DEMO, REPO_URL } from '$lib/demo/flag';

	let { data } = $props();

	const fileUrl = (file: string) => `${REPO_URL}/blob/main/${file}`;

	let busy = $state(false);
	let demoMessage = $state('');

	async function demo(action: 'loadSample' | 'resetData') {
		busy = true;
		demoMessage = '';
		try {
			const ui = await import('$lib/demo/ui');
			demoMessage = await ui[action]();
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Attributions · Self-Guitar</title></svelte:head>

<main class="mx-auto w-full max-w-3xl p-4 md:p-8">
	<h1 class="mb-2 text-2xl font-bold">Attributions</h1>
	<p class="mb-6 text-muted">Source and license of every content item bundled with this app.</p>

	{#if DEMO}
		<section id="demo" class="card mb-8 text-sm" data-testid="demo-section">
			<h2 class="mb-2 text-lg font-semibold">About this demo</h2>
			<p class="mb-3">
				This is the static demo of Self-Guitar: everything runs in your browser and your progress is
				stored in this browser only (nothing is sent anywhere). It is saved right after each change;
				closing the tab within a split second of one can still lose that change. The full app is
				self-hosted with Docker; source and instructions are on
				<a class="text-accent underline" href={REPO_URL} rel="noopener noreferrer" target="_blank"
					>GitHub</a
				>.
			</p>
			<div class="flex flex-wrap gap-2">
				<button
					class="btn"
					onclick={() => demo('loadSample')}
					disabled={busy}
					data-testid="demo-load-sample">Load sample progress</button
				>
				<button
					class="btn text-danger"
					onclick={() => demo('resetData')}
					disabled={busy}
					data-testid="demo-reset">Reset data…</button
				>
			</div>
			<p class="mt-2 text-muted" aria-live="polite" data-testid="demo-message">{demoMessage}</p>
		</section>
	{/if}

	<h2 class="mb-3 text-lg font-semibold">Licenses</h2>
	<ul class="card mb-8 flex flex-col gap-2 text-sm" data-testid="content-licenses">
		{#each thirdParty.content as c (c.name)}
			<li>
				{c.name} — {c.license}
				(<a class="underline" href={fileUrl(c.file)} rel="noopener noreferrer" target="_blank"
					>{c.file}</a
				>)
			</li>
		{/each}
	</ul>

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
	<ul class="flex flex-col gap-3" data-testid="assets">
		{#each thirdParty.assets as a (a.name)}
			<li class="card text-sm">
				<div class="mb-1 font-semibold">
					<a class="underline" href={a.url} rel="noopener noreferrer" target="_blank">{a.name}</a>
					— {a.license}
				</div>
				<div class="text-muted">{a.holder.replace(/\.$/, '')}. {a.note}</div>
			</li>
		{/each}
	</ul>
	<div class="card mt-3 overflow-x-auto p-0 text-sm" data-testid="packages">
		<table class="w-full text-left">
			<thead class="text-muted">
				<tr>
					<th class="px-3 py-2 font-medium">Package</th>
					<th class="px-3 py-2 font-medium">License</th>
					<th class="hidden px-3 py-2 font-medium sm:table-cell">Used in</th>
				</tr>
			</thead>
			<tbody>
				{#each thirdParty.packages as p (p.name)}
					<tr class="border-t border-line">
						<td class="px-3 py-1.5">
							<a class="underline" href={p.url} rel="noopener noreferrer" target="_blank"
								>{p.name}</a
							>
							<span class="text-muted">{p.version}</span>
						</td>
						<td class="px-3 py-1.5">{p.license}</td>
						<td class="hidden px-3 py-1.5 text-muted sm:table-cell">{p.use}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="mt-3 text-sm text-muted">
		Full notices, with every package's license text:
		<a class="underline" href="{base}/THIRD_PARTY_NOTICES.txt" data-testid="notices-link"
			>THIRD_PARTY_NOTICES.txt</a
		>.
	</p>
</main>
