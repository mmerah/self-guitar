<script lang="ts">
	import { base } from '$app/paths';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import { toolHref, toolPreset, TOOLS, type ToolContext } from './tools';
	import type { ToolName } from './types';

	let {
		name,
		params,
		label,
		context = {}
	}: {
		name: ToolName;
		params: Record<string, string>;
		label?: string;
		/** The lesson linking it (back button) and its goal for this tool. */
		context?: ToolContext;
	} = $props();

	const icons: Record<ToolName, IconName> = {
		tuner: 'tuner',
		metronome: 'metronome',
		changes: 'timer'
	};
	const preset = $derived(toolPreset(name, params));
</script>

<a
	href={base + toolHref(name, params, context)}
	class="card flex min-h-20 items-center gap-3 p-3 hover:bg-surface-2"
	data-testid="tool-link"
	data-tool={name}
>
	<span class="rounded-2xl bg-surface-2 p-3 text-accent"><Icon name={icons[name]} size={28} /></span
	>
	<span class="min-w-0 flex-1">
		<span class="block text-lg leading-tight font-semibold">{label ?? TOOLS[name].title}</span>
		<span class="block text-sm text-muted"
			>{preset || TOOLS[name].text}{context.target !== undefined
				? ` · goal ${context.target}/min`
				: ''}</span
		>
	</span>
	<Icon name="forward" />
</a>
