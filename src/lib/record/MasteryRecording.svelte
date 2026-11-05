<script lang="ts">
	// Self-check masteries (L5 improvise, L7 studies, L8 modal, L9): optionally attach a take of the
	// lesson's piece as evidence. Kept in this browser with the takes (the server's mastery record
	// has no field for it); never required.
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { Block, Lesson } from '$lib/learn/types';
	import { itemHref } from './context';
	import { decodeTake, TakePlayer } from './playback';
	import { formatDuration } from './quota';
	import { attachmentFor, attachTake, listTakes, onTakesChanged } from './store';
	import type { ItemType, Take } from './types';

	let { lesson }: { lesson: Lesson } = $props();

	/** The exercises and songs the lesson's body plays. */
	function itemsOf(blocks: Block[]): { itemType: ItemType; itemId: string }[] {
		return blocks.flatMap((b) =>
			b.t === 'exercise'
				? [{ itemType: 'exercise' as const, itemId: b.id }]
				: b.t === 'song'
					? [{ itemType: 'song' as const, itemId: b.id }]
					: b.t === 'callout'
						? itemsOf(b.blocks)
						: []
		);
	}
	const items = $derived(itemsOf(lesson.blocks));
	let takes = $state<Take[]>([]);
	let attached = $state<string | null>(null);
	let playing = $state(false);
	const player = new TakePlayer();
	player.onend = () => (playing = false);

	const mine = $derived(
		takes.filter((t) => items.some((i) => i.itemType === t.itemType && i.itemId === t.itemId))
	);
	const latest = $derived(mine[0]);
	const linked = $derived(attached ? takes.find((t) => t.id === attached) : undefined);
	const day = (t: number) =>
		new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

	async function load() {
		try {
			[takes, attached] = await Promise.all([listTakes(), attachmentFor(lesson.id)]);
		} catch {
			takes = [];
		}
	}
	onMount(() => {
		void load();
		const off = onTakesChanged(load);
		return () => {
			off();
			player.stop(false);
		};
	});

	async function toggle(t: Take) {
		if (playing) {
			player.stop(false);
			playing = false;
			return;
		}
		const b = await decodeTake(t.id);
		if (!b) return;
		player.play(b);
		playing = true;
	}
</script>

{#if items.length}
	<div class="rounded-xl bg-surface-2 px-3 py-2 text-sm" data-testid="mastery-recording">
		{#if linked}
			<div class="flex items-center gap-2">
				<button
					class="btn size-10 shrink-0 rounded-full p-0"
					onclick={() => toggle(linked)}
					aria-label={playing ? 'Stop' : 'Play the attached take'}
					><Icon name={playing ? 'stop' : 'play'} size={18} /></button
				>
				<span class="min-w-0 flex-1 leading-tight"
					><b>Recording attached</b><span class="block truncate text-xs text-muted"
						>{linked.title} · {day(linked.createdAt)} · {formatDuration(linked.duration)}</span
					></span
				>
				<button class="btn min-h-9 px-2 text-xs" onclick={() => attachTake(lesson.id, null)}
					>Detach</button
				>
			</div>
		{:else if latest}
			<button
				class="btn min-h-11 w-full justify-start gap-2 bg-transparent! px-0 text-left"
				onclick={() => attachTake(lesson.id, latest.id)}
				data-testid="mastery-attach"
				><span class="size-3 shrink-0 rounded-full bg-danger"></span><span
					class="min-w-0 leading-tight"
					>Attach a recording <span class="text-xs text-muted">(optional)</span><span
						class="block truncate text-xs font-normal text-muted"
						>Latest: {latest.title} · {day(latest.createdAt)}</span
					></span
				></button
			>
		{:else}
			{@const href = itemHref(base, items[0])}
			<p class="text-xs text-muted">
				Optional: record yourself with <b>● Rec</b> in
				{#if href}<a class="text-accent underline" {href}>the lesson's piece</a>{:else}the player{/if}
				and attach the take here to hear later how far you came.
			</p>
		{/if}
	</div>
{/if}
