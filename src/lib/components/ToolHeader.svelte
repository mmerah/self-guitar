<script lang="ts">
	import { base } from '$app/paths';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { fromLesson, fromSession } from '$lib/learn/from';
	import PageHeader from './PageHeader.svelte';

	let { title, actions }: { title: string; actions?: Snippet } = $props();

	// Opened from a lesson (?from=<lesson id>): back returns to it.
	const from = $derived(fromLesson(page.url));
	const session = $derived(fromSession(page.url));
</script>

<PageHeader
	{title}
	{actions}
	back={{
		href: base + (session ? '/session' : from ? `/learn/${from}` : '/tools'),
		label: session ? 'Back to the session' : from ? 'Back to the lesson' : 'All tools',
		testid: 'tool-back'
	}}
/>
