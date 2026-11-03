<script lang="ts">
	// The demo's notice (what this is, sample data, reset, source), its storage alerts and toasts.
	// Dismissed (remembered per browser) or on a short landscape screen, it folds into a "Demo"
	// chip that opens it again.
	import { onMount } from 'svelte';
	import { WRITE_FAILED_EVENT } from '$lib/session/client';
	import { REPO_URL } from './flag';
	import { demoStatus } from './status.svelte';
	import { loadSample, resetData } from './ui';

	let { immersive = false }: { immersive?: boolean } = $props();

	const KEY = 'demo-banner-dismissed';
	let dismissed = $state(true);
	let expanded = $state(false);
	let busy = $state(false);
	let loaded = $state(false);

	const alert = $derived(
		demoStatus.storage === 'unavailable'
			? "Browser storage is unavailable: the demo works, but progress won't be saved."
			: demoStatus.storage === 'quota'
				? "Browser storage is full: recent progress isn't saved. Free some space, or reset the demo data."
				: demoStatus.storage === 'failed'
					? 'Progress could not be saved in this browser; it is retried with your next change.'
					: demoStatus.otherTab
						? 'Self-Guitar is open in another tab: use one tab at a time, or changes may be lost.'
						: ''
	);

	onMount(() => {
		try {
			dismissed = localStorage.getItem(KEY) === '1';
		} catch {
			dismissed = false;
		}
		const failed = (e: Event) => (demoStatus.notice = (e as CustomEvent<string>).detail);
		addEventListener(WRITE_FAILED_EVENT, failed);
		return () => removeEventListener(WRITE_FAILED_EVENT, failed);
	});

	function close() {
		expanded = false;
		dismissed = true;
		try {
			localStorage.setItem(KEY, '1');
		} catch {
			// not remembered: it shows again next visit
		}
	}

	async function sample() {
		busy = true;
		loaded = (await loadSample()).startsWith('Sample loaded');
		busy = false;
	}

	async function reset() {
		busy = true;
		await resetData();
		busy = false;
	}
</script>

{#if alert}
	<p
		class="border-b border-line bg-surface-2 px-4 py-2 text-sm text-danger"
		role="alert"
		data-testid="demo-storage-alert"
	>
		{alert}
	</p>
{/if}
{#if demoStatus.notice}
	<div
		class="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-1 text-sm"
		role="alert"
		data-testid="demo-notice"
	>
		<p class="flex-1">{demoStatus.notice}</p>
		<button
			class="grid size-8 place-items-center rounded-full text-muted"
			aria-label="Dismiss"
			onclick={() => (demoStatus.notice = '')}>✕</button
		>
	</div>
{/if}

{#if !immersive}
	{#if !dismissed || expanded}
		<!-- One line; "Options" (or the Demo chip, once dismissed) opens the actions. -->
		<aside
			class="border-b border-line bg-surface-2 px-3 text-[13px] {expanded ? '' : 'short:hidden'}"
			aria-label="Demo notice"
			data-testid="demo-banner"
		>
			<div class="flex min-h-9 items-center gap-2">
				<p class="min-w-0 flex-1 truncate">
					<strong class="font-semibold"
						><span class="hidden sm:inline">Self-Guitar </span>Demo</strong
					>
					· Progress stays in this browser
				</p>
				<button
					class="flex min-h-9 shrink-0 items-center px-1 font-medium text-accent"
					onclick={() => (expanded = !expanded)}
					aria-expanded={expanded}
					data-testid="demo-options">Options</button
				>
				<button
					class="-mr-1.5 grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface"
					onclick={close}
					aria-label="Close the demo notice"
					data-testid="demo-dismiss">✕</button
				>
			</div>
			{#if expanded}
				<div class="flex flex-wrap items-center gap-x-4 gap-y-1 pb-2">
					{#if !loaded}
						<button
							class="min-h-9 text-accent underline disabled:opacity-60"
							onclick={sample}
							disabled={busy}
							data-testid="demo-sample">{busy ? 'Working…' : 'Load sample progress'}</button
						>
					{/if}
					<button
						class="min-h-9 text-accent underline disabled:opacity-60"
						onclick={reset}
						disabled={busy}
						data-testid="demo-banner-reset">Reset data…</button
					>
					<a class="text-accent underline" href={REPO_URL} rel="noopener noreferrer" target="_blank"
						>GitHub</a
					>
				</div>
			{/if}
		</aside>
	{/if}
	{#if !expanded}
		<div class="px-3 pt-1 {dismissed ? 'flex' : 'hidden short:flex'}">
			<button
				class="chip chip-accent min-h-5 text-[11px]"
				onclick={() => (expanded = true)}
				aria-expanded="false"
				aria-label="Demo options"
				data-testid="demo-chip">Demo</button
			>
		</div>
	{/if}
{/if}

{#if demoStatus.toast}
	<div
		class="fixed inset-x-4 bottom-20 z-30 mx-auto max-w-sm rounded-xl bg-fg px-4 py-3 text-center text-sm font-medium text-bg shadow-lg md:bottom-6"
		role="status"
		data-testid="demo-toast"
	>
		{demoStatus.toast}
	</div>
{/if}
