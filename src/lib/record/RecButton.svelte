<script lang="ts">
	// The one "Rec" button (player, ladder, chord sheet, warm-ups): a red record ring over "Rec",
	// the size of the players' toolbar toggles, placed with them just before ⋯. Where a phone
	// toolbar has no room, the same action is "Record yourself" in ⋯ (see TabPlayer).
	let {
		onclick,
		disabled = false,
		pressed = false,
		expanded
	}: {
		onclick: () => void;
		disabled?: boolean;
		/** A take is being recorded. */
		pressed?: boolean;
		/** The mode menu is open (players only). */
		expanded?: boolean;
	} = $props();
</script>

<button
	class="btn btn-toggle min-w-11 flex-col gap-0 px-1 text-[10px] leading-tight font-medium whitespace-nowrap"
	{onclick}
	{disabled}
	aria-expanded={expanded}
	aria-haspopup={expanded === undefined ? undefined : 'true'}
	aria-pressed={pressed}
	aria-label="Record yourself"
	title="Record yourself"
	data-testid="rec-button"
>
	<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" class="text-danger">
		<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2" />
		<circle cx="12" cy="12" r="4.5" fill="currentColor" />
	</svg>
	<span aria-hidden="true">Rec</span>
</button>
