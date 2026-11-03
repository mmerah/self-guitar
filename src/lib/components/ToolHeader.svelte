<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

	let { title, actions }: { title: string; actions?: Snippet } = $props();
</script>

<header class="mb-4 flex items-center gap-2 short:mb-2">
	<a href="/tools" class="btn -ml-2 bg-transparent!" aria-label="All tools"><Icon name="back" /></a>
	<h1 class="min-w-0 flex-1 truncate text-2xl font-bold">{title}</h1>
	{@render actions?.()}
	<div class="md:hidden"><ThemeToggle /></div>
</header>
