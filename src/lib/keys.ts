// Keyboard and Bluetooth page-turner pedals (they send arrows, PageUp/PageDown or Space/Enter):
// shared by the tempo ladder and the 1-minute-changes timer.

/** "Yes / next / count one": right arrow, down arrow, PageDown, Space, Enter. */
export const PEDAL_NEXT = ['Space', 'Enter', 'ArrowRight', 'ArrowDown', 'PageDown'];
/** "No / back": left arrow, up arrow, PageUp, Backspace. */
export const PEDAL_BACK = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'];

/**
 * True when the focused element handles this key itself, so a page-wide shortcut must leave it
 * alone: every key in a text field or select; Space/Enter on a button, link or other control
 * (that is how keyboard users press it). Arrows and pedal keys stay global on buttons.
 */
export function focusOwnsKey(e: KeyboardEvent): boolean {
	const t = e.target;
	if (!(t instanceof Element)) return false;
	if (t.closest('input, select, textarea, [contenteditable=""], [contenteditable="true"]'))
		return true;
	const control = t.closest(
		'button, a[href], summary, [role=button], [role=link], [role=checkbox], [role=switch], [role=tab], [tabindex]:not([tabindex="-1"])'
	);
	return !!control && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter');
}

// ---- the session runner ----------------------------------------------------------------------
// The runner's "Done / next" keys must not collide with the ladder inside a block: in a session
// the ladder keeps Space / → (clean) and ← / Backspace (miss); the runner takes PageDown / Enter.

/** Ladder keys inside a session block. */
export const LADDER_SESSION_KEYS = {
	next: ['Space', 'ArrowRight'],
	back: ['ArrowLeft', 'Backspace']
};
/** Runner: the block is done. */
export const RUNNER_DONE = ['PageDown', 'Enter', 'NumpadEnter'];
/** Runner, rating step: accept the suggested rating (🙂 OK when nothing is suggested). */
export const RUNNER_ACCEPT = ['ArrowRight', 'PageDown', 'Enter', 'NumpadEnter'];

let suspended = false;
/** While a dialog is open, page-wide shortcuts of the widgets underneath stay inert. */
export const keysSuspended = () => suspended;
export function suspendKeys(on: boolean) {
	suspended = on;
}
