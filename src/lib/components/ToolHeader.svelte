<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { fromLesson, fromSession } from '$lib/learn/from';
	import Icon from './Icon.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

	let { title, actions }: { title: string; actions?: Snippet } = $props();

	// Opened from a lesson (?from=<lesson id>): back returns to it.
	const from = $derived(fromLesson(page.url));
	const session = $derived(fromSession(page.url));
</script>

<header class="mb-4 flex items-center gap-2 short:mb-2">
	<a
		href={session ? '/session' : from ? `/learn/${from}` : '/tools'}
		class="btn -ml-2 bg-transparent!"
		aria-label={session ? 'Back to the session' : from ? 'Back to the lesson' : 'All tools'}
		data-testid="tool-back"><Icon name="back" /></a
	>
	<h1 class="min-w-0 flex-1 truncate text-2xl font-bold">{title}</h1>
	{@render actions?.()}
	<div class="md:hidden"><ThemeToggle /></div>
</header>
