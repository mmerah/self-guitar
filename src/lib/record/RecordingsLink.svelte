<script lang="ts">
	// "My recordings (n)" for one item (the players' ⋯ menu).
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { recordingsHref } from './context';
	import { onTakesChanged, takesFor } from './store';
	import type { RecordItem } from './types';

	let { item }: { item: RecordItem } = $props();
	let count = $state<number | null>(null);

	function load() {
		takesFor(item.itemType, item.itemId).then(
			(t) => (count = t.length),
			() => (count = null)
		);
	}
	onMount(() => {
		load();
		return onTakesChanged(load);
	});
</script>

<a
	class="btn justify-start bg-transparent!"
	role="menuitem"
	href={recordingsHref(base, item)}
	data-testid="my-recordings"
	data-count={count ?? 0}
	><Icon name="waveform" size={20} />My recordings{count !== null ? ` (${count})` : ''}</a
>
