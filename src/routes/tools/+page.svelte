<script lang="ts">
	import { base } from '$app/paths';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	const tools: { href: string; title: string; text: string; icon: IconName }[] = [
		{
			href: '/tools/tuner',
			title: 'Tuner',
			text: 'Standard, Drop D, DADGAD, open G/D',
			icon: 'tuner'
		},
		{
			href: '/tools/metronome',
			title: 'Metronome',
			text: 'Subdivisions, tap tempo, speed trainer',
			icon: 'metronome'
		},
		{
			href: '/tools/chords',
			title: 'Chords',
			text: 'Diagrams, voicings, hear them',
			icon: 'chords'
		},
		{
			href: '/tools/changes',
			title: '1-minute changes',
			text: 'Count chord changes, beat your best',
			icon: 'timer'
		}
	];
</script>

<svelte:head><title>Tools · Self-Guitar</title></svelte:head>

<main class="mx-auto w-full max-w-3xl p-4 md:p-8">
	<header class="mb-6 flex items-center justify-between">
		<h1 class="text-2xl font-bold">Tools</h1>
		<div class="md:hidden"><ThemeToggle /></div>
	</header>
	<ul class="grid gap-3 sm:grid-cols-2">
		{#each tools as tool (tool.href)}
			<li>
				<a
					href={base + tool.href}
					class="card flex h-full min-h-28 items-center gap-4 hover:bg-surface-2 sm:min-h-40 sm:flex-col sm:items-start sm:justify-between"
					data-testid="tool-card"
				>
					<span class="rounded-2xl bg-surface-2 p-3 text-accent"
						><Icon name={tool.icon} size={32} /></span
					>
					<span>
						<span class="block text-xl font-semibold">{tool.title}</span>
						<span class="text-muted">{tool.text}</span>
					</span>
				</a>
			</li>
		{/each}
	</ul>
</main>
