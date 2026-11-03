<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { pwaInfo } from 'virtual:pwa-info';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	let { children } = $props();

	const nav: { href: string; label: string; icon: IconName; enabled: boolean }[] = [
		{ href: '/', label: 'Home', icon: 'home', enabled: true },
		{ href: '/library', label: 'Library', icon: 'library', enabled: true },
		{ href: '/learn', label: 'Learn', icon: 'learn', enabled: false },
		{ href: '/tools', label: 'Tools', icon: 'tools', enabled: true }
	];

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	// The player is full-screen on phones: it has its own back button instead of the bottom nav.
	const immersive = $derived(page.url.pathname.startsWith('/play/'));

	onMount(async () => {
		if (pwaInfo) {
			const { registerSW } = await import('virtual:pwa-register');
			registerSW({ immediate: true });
		}
		navigator.storage?.persist?.().catch(() => {});
	});
</script>

<svelte:head>
	{#if pwaInfo}
		<link rel="manifest" href={pwaInfo.webManifest.href} />
	{/if}
</svelte:head>

<div class="flex min-h-dvh">
	<!-- Side rail: tablet/desktop -->
	<nav
		class="sticky top-0 hidden h-dvh w-20 shrink-0 flex-col items-center gap-2 border-r border-line bg-surface py-4 md:flex {immersive
			? 'short:hidden'
			: ''}"
		aria-label="Main"
	>
		<a href="/" class="mb-4 text-accent" aria-label="Self-Guitar home">
			<img src="/favicon.svg" alt="" width="36" height="36" />
		</a>
		{#each nav as item (item.href)}
			{#if item.enabled}
				<a
					href={item.href}
					class="flex min-h-14 w-16 flex-col items-center justify-center gap-1 rounded-xl text-xs {isActive(
						item.href
					)
						? 'bg-surface-2 text-accent'
						: 'text-muted'}"
					aria-current={isActive(item.href) ? 'page' : undefined}
				>
					<Icon name={item.icon} />{item.label}
				</a>
			{:else}
				<span
					class="flex min-h-14 w-16 flex-col items-center justify-center gap-1 text-xs text-muted opacity-40"
					title="Coming soon"
					aria-disabled="true"><Icon name={item.icon} />{item.label}</span
				>
			{/if}
		{/each}
		<div class="mt-auto"><ThemeToggle /></div>
	</nav>

	<div class="flex min-w-0 flex-1 flex-col {immersive ? '' : 'pb-16 md:pb-0'}">
		{@render children()}
	</div>

	<!-- Bottom nav: phone -->
	{#if !immersive}
		<nav
			class="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
			aria-label="Main"
		>
			{#each nav as item (item.href)}
				{#if item.enabled}
					<a
						href={item.href}
						class="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs {isActive(
							item.href
						)
							? 'text-accent'
							: 'text-muted'}"
						aria-current={isActive(item.href) ? 'page' : undefined}
					>
						<Icon name={item.icon} />{item.label}
					</a>
				{:else}
					<span
						class="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs text-muted opacity-40"
						aria-disabled="true"
						title="Coming soon"><Icon name={item.icon} />{item.label}</span
					>
				{/if}
			{/each}
		</nav>
	{/if}
</div>
