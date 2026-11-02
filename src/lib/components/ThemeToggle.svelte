<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';

	let theme = $state<'dark' | 'light'>('dark');

	onMount(() => {
		theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
	});

	function toggle() {
		theme = theme === 'dark' ? 'light' : 'dark';
		document.documentElement.dataset.theme = theme;
		try {
			localStorage.setItem('theme', theme);
		} catch {
			// storage unavailable: theme still applies for this visit
		}
	}
</script>

<button
	class="btn"
	onclick={toggle}
	aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
	title="Toggle theme"
>
	<Icon name={theme === 'dark' ? 'sun' : 'moon'} />
</button>
