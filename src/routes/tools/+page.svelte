<script lang="ts">
	import { base } from '$app/paths';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

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
		},
		{
			href: '/tools/fretboard',
			title: 'Fretboard',
			text: 'Scales, boxes, CAGED, notes, quiz',
			icon: 'fretboard'
		},
		{
			href: '/tools/ear',
			title: 'Ear trainer',
			text: 'Intervals, chords, progressions',
			icon: 'listen'
		}
	];
</script>

<svelte:head><title>Tools · Self-Guitar</title></svelte:head>

<main class="mx-auto w-full max-w-3xl px-3 py-2 md:p-8">
	<PageHeader title="Tools" />
	<ul class="grid gap-2 sm:grid-cols-2 sm:gap-3">
		{#each tools as tool (tool.href)}
			<li>
				<a
					href={base + tool.href}
					class="card flex h-full min-h-20 items-center gap-3 hover:bg-surface-2 sm:min-h-40 sm:flex-col sm:items-start sm:justify-between"
					data-testid="tool-card"
				>
					<span class="rounded-2xl bg-surface-2 p-2.5 text-accent"
						><Icon name={tool.icon} size={28} /></span
					>
					<span>
						<span class="block text-lg font-semibold">{tool.title}</span>
						<span class="text-sm text-muted">{tool.text}</span>
					</span>
				</a>
			</li>
		{/each}
	</ul>
</main>
