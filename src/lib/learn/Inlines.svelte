<script lang="ts">
	import { base } from '$app/paths';
	import Inlines from './Inlines.svelte';
	import type { Inline } from './types';

	let { nodes }: { nodes: Inline[] } = $props();
</script>

{#each nodes as n, i (i)}
	{#if n.t === 'text'}{n.v}{:else if n.t === 'strong'}<strong class="font-semibold"
			><Inlines nodes={n.c} /></strong
		>{:else if n.t === 'em'}<em><Inlines nodes={n.c} /></em>{:else if n.t === 'code'}<code
			class="rounded bg-surface-2 px-1 py-0.5 text-[0.9em]">{n.v}</code
		>{:else if n.t === 'link'}<a
			class="text-accent underline underline-offset-2"
			href={n.href.startsWith('/') ? base + n.href : n.href}
			rel={n.href.startsWith('/') ? undefined : 'noopener noreferrer'}
			target={n.href.startsWith('/') ? undefined : '_blank'}><Inlines nodes={n.c} /></a
		>{/if}
{/each}
