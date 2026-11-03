<script lang="ts">
	// Small settings sheet: weekly goal (days × minutes) and the default session length.
	import { untrack } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { SESSION_LENGTHS, type Settings } from './types';

	let {
		settings,
		onsave,
		onclose
	}: { settings: Settings; onsave: (s: Settings) => Promise<void>; onclose: () => void } = $props();

	// Edited copies of the initial values (the sheet is re-created each time it opens).
	let days = $state(untrack(() => settings.weeklyDays));
	let daily = $state(untrack(() => settings.dailyMin));
	let length = $state(untrack(() => settings.sessionMin));
	let saving = $state(false);
	let problem = $state('');
	let dialog: HTMLDialogElement;

	$effect(() => {
		dialog.showModal();
	});

	async function save() {
		saving = true;
		problem = '';
		try {
			await onsave({ weeklyDays: days, dailyMin: daily, sessionMin: length });
			onclose();
		} catch (e) {
			problem = (e as Error).message;
		} finally {
			saving = false;
		}
	}
</script>

<dialog
	bind:this={dialog}
	class="m-auto w-[min(28rem,calc(100%-2rem))] rounded-2xl border border-line bg-surface p-0 text-fg backdrop:bg-black/60"
	{onclose}
	aria-labelledby="goal-title"
	data-testid="goal-settings"
>
	<div class="flex flex-col gap-4 p-4">
		<header class="flex items-center gap-2">
			<h2 id="goal-title" class="flex-1 text-lg font-bold">Weekly goal</h2>
			<button class="btn bg-transparent!" aria-label="Close" onclick={() => dialog.close()}
				><Icon name="close" /></button
			>
		</header>
		<fieldset>
			<legend class="mb-1 text-sm text-muted">Days a week</legend>
			<div class="segmented">
				{#each [1, 2, 3, 4, 5, 6, 7] as n (n)}
					<button type="button" aria-pressed={days === n} onclick={() => (days = n)}>{n}</button>
				{/each}
			</div>
		</fieldset>
		<fieldset>
			<legend class="mb-1 text-sm text-muted">Minutes that count as a day</legend>
			<div class="segmented">
				{#each [5, 10, 15, 20, 30] as n (n)}
					<button type="button" aria-pressed={daily === n} onclick={() => (daily = n)}>{n}</button>
				{/each}
			</div>
		</fieldset>
		<fieldset>
			<legend class="mb-1 text-sm text-muted">Default session length</legend>
			<div class="segmented">
				{#each SESSION_LENGTHS as n (n)}
					<button type="button" aria-pressed={length === n} onclick={() => (length = n)}
						>{n} min</button
					>
				{/each}
			</div>
		</fieldset>
		<p class="text-sm text-muted">
			Goal: {days}
			{days === 1 ? 'day' : 'days'} × {daily} min a week. One missed day a week is covered by a freeze.
		</p>
		{#if problem}<p class="text-sm text-danger" role="alert">{problem}</p>{/if}
		<button
			class="btn btn-primary min-h-12 text-base"
			onclick={save}
			disabled={saving}
			data-testid="goal-save">Save</button
		>
	</div>
</dialog>
