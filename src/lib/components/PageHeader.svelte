<script lang="ts">
	// The one page header: a single ~48px line with an optional back link, the title (and an
	// optional one-line subtitle), icon actions and the phone theme toggle.
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

	let {
		title,
		subtitle,
		back,
		actions,
		bar = false,
		theme = true,
		testid
	}: {
		title: string;
		subtitle?: string;
		back?: { href: string; label: string; testid?: string };
		actions?: Snippet;
		/** Full-bleed bar (immersive pages: player, exercise). */
		bar?: boolean;
		/** The theme toggle (phones; tablets have it in the side rail). */
		theme?: boolean;
		testid?: string;
	} = $props();
</script>

<header
	class="flex min-h-12 items-center gap-1 {bar
		? 'border-b border-line bg-surface px-1 py-0.5 short:min-h-11 short:py-0'
		: 'mb-2'}"
	data-testid={testid}
>
	{#if back}
		<a
			href={back.href}
			class="btn shrink-0 bg-transparent! px-2 {bar ? '' : '-ml-2'}"
			aria-label={back.label}
			data-testid={back.testid}><Icon name="back" /></a
		>
	{/if}
	<div class="min-w-0 flex-1">
		<h1
			class="truncate leading-tight font-bold {subtitle ? 'text-lg' : 'text-xl md:text-2xl'}"
			{title}
		>
			{title}
		</h1>
		{#if subtitle}<p class="truncate text-xs text-muted">{subtitle}</p>{/if}
	</div>
	{@render actions?.()}
	{#if theme}<div class="md:hidden"><ThemeToggle /></div>{/if}
</header>
