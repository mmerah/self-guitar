<script lang="ts">
	// The build's version, tap to copy; says so when a newer version is waiting.
	import { pwaUpdate } from './state.svelte';
	import { VERSION_TEXT } from './version';

	let { class: cls = '' }: { class?: string } = $props();

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy() {
		try {
			await navigator.clipboard.writeText(VERSION_TEXT);
			copied = true;
			clearTimeout(timer);
			timer = setTimeout(() => (copied = false), 1500);
		} catch {
			// no clipboard (insecure context, denied): the text stays selectable
		}
	}
</script>

<p class="text-xs text-muted {cls}">
	<button
		type="button"
		class="min-h-6 select-text text-left underline-offset-2 hover:underline"
		onclick={copy}
		title="Copy the version"
		data-testid="app-version">{VERSION_TEXT}</button
	>
	{#if copied}<span role="status" class="text-accent">Copied</span>{/if}
	{#if pwaUpdate.needRefresh}<span data-testid="app-version-update">(update available)</span>{/if}
</p>
