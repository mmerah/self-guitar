<script lang="ts">
	import { base } from '$app/paths';
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { pwaInfo } from 'virtual:pwa-info';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { fromLesson, fromSession } from '$lib/learn/from';
	import SessionBar from '$lib/session/SessionBar.svelte';
	import { startOutboxSync } from '$lib/session/client';
	import { DEMO } from '$lib/demo/flag';
	import DemoBanner from '$lib/demo/DemoBanner.svelte';

	let { children } = $props();

	const nav: { href: string; label: string; icon: IconName; enabled: boolean }[] = [
		{ href: '/', label: 'Today', icon: 'today', enabled: true },
		{ href: '/learn', label: 'Learn', icon: 'learn', enabled: true },
		{ href: '/library', label: 'Library', icon: 'library', enabled: true },
		{ href: '/tools', label: 'Tools', icon: 'tools', enabled: true },
		{ href: '/progress', label: 'Progress', icon: 'chart', enabled: true }
	];

	// A tool opened from a lesson (?from=) belongs to Learn, one opened from the session to Today:
	// that tab stays active.
	// The route path, without the app's base path.
	const path = $derived(page.url.pathname.slice(base.length) || '/');
	const section = $derived(
		fromSession(page.url)
			? '/'
			: path.startsWith('/tools') && fromLesson(page.url)
				? '/learn'
				: path
	);
	const isActive = (href: string) => (href === '/' ? section === '/' : section.startsWith(href));
	// The player and exercise practice are full-screen on phones: they have their own back button
	// instead of the bottom nav.
	const immersive = $derived(
		path.startsWith('/play/') ||
			path.startsWith('/practice/') ||
			path.startsWith('/warmups/') ||
			path === '/session'
	);

	onMount(async () => {
		// The demo opens its database at once: another tab owning it shows the notice right away.
		if (DEMO) void import('$lib/demo/shim').then((m) => m.demoDb()).catch((e) => console.error(e));
		// Session writes made offline are sent when the connection is back (and retried while
		// anything is queued).
		startOutboxSync();
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
		<a href="{base}/" class="mb-4 text-accent" aria-label="Self-Guitar home">
			<img src="{base}/favicon.svg" alt="" width="36" height="36" />
		</a>
		{#each nav as item (item.href)}
			{#if item.enabled}
				<a
					href={base + item.href}
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
		{#if DEMO}<DemoBanner {immersive} />{/if}
		{#if fromSession(page.url)}
			{#key page.url.pathname}<SessionBar />{/key}
		{/if}
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
						href={base + item.href}
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
