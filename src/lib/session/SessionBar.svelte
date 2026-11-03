<script lang="ts">
	import { base } from '$app/paths';
	// A slim bar on lesson and tool pages opened from a session (?from=session): the block's
	// clock keeps running here, says when its time is up, and leads back to the runner.
	import { onDestroy, onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { activeSession } from './client';
	import { chime, clock, LiveSession } from './live.svelte';

	const live = new LiveSession();
	let detach: (() => void) | null = null;

	onMount(() => {
		const s = activeSession();
		if (s && s.idx < s.blocks.length) detach = live.attach(s, chime);
	});
	onDestroy(() => detach?.());

	const s = $derived(live.s);
	const block = $derived(s && s.idx < s.blocks.length ? s.blocks[s.idx] : null);
	const up = $derived(!!s && s.phase === 'play' && (s.timeUp || live.remaining <= 0));
</script>

{#if s && block}
	<div
		class="sticky top-0 z-30 flex items-center gap-2 border-b border-line px-3 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] {up
			? 'bg-accent text-accent-fg'
			: 'bg-surface'}"
		data-testid="session-bar"
		data-time-up={up}
	>
		<Icon name="timer" size={18} />
		<p class="min-w-0 flex-1 truncate text-sm">
			{#if up}<b>Time’s up</b> · {block.title}{:else}Session · <b>{block.title}</b>{/if}
		</p>
		<span class="text-xl font-bold tabular-nums" role="timer" data-testid="session-bar-timer"
			>{clock(live.remaining)}</span
		>
		<a
			href="{base}/session"
			class="btn min-h-10 {up ? 'bg-surface! text-fg!' : 'btn-primary'}"
			data-testid="back-to-session-bar"><Icon name="back" size={18} />Back to session</a
		>
	</div>
{/if}
