<script lang="ts">
	// "New version available · Reload": a slim bar above the bottom nav, never a modal.
	import { applyUpdate, pwaUpdate } from './state.svelte';

	let { immersive = false }: { immersive?: boolean } = $props();
</script>

{#if pwaUpdate.needRefresh && !pwaUpdate.dismissed}
	<!-- Room at the end of the page, so the bar never hides its last line. -->
	<div class="h-16 shrink-0" aria-hidden="true"></div>
	<div
		class="fixed inset-x-3 z-30 mx-auto flex max-w-sm items-center gap-1 rounded-xl border border-line bg-surface-2 py-1 pr-1 pl-4 text-sm shadow-lg md:bottom-4 {immersive
			? 'bottom-4'
			: 'bottom-[calc(4.5rem+env(safe-area-inset-bottom))]'}"
		role="status"
		data-testid="update-bar"
	>
		<p class="min-w-0 flex-1 truncate">New version available</p>
		<button
			class="min-h-9 shrink-0 rounded-lg px-3 font-semibold text-accent hover:bg-surface disabled:opacity-60"
			onclick={applyUpdate}
			disabled={pwaUpdate.applying}
			data-testid="update-reload">{pwaUpdate.applying ? 'Reloading…' : 'Reload'}</button
		>
		<button
			class="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface"
			aria-label="Later"
			onclick={() => (pwaUpdate.dismissed = true)}
			data-testid="update-dismiss">✕</button
		>
	</div>
{/if}
