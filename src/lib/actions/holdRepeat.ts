// Press-and-hold repeat for +/- buttons: one step on press, then repeats, speeding up.
// Keyboard activation (Enter/Space, click with detail 0) still steps once.
import type { Action } from 'svelte/action';

export const holdRepeat: Action<HTMLElement, () => void> = (node, step) => {
	let fn = step;
	let timer: ReturnType<typeof setTimeout> | undefined;

	const stop = () => clearTimeout(timer);
	const loop = (delay: number) => {
		timer = setTimeout(() => {
			fn();
			loop(Math.max(40, delay * 0.85));
		}, delay);
	};
	const down = (e: PointerEvent) => {
		if (e.button !== 0) return;
		stop();
		fn();
		timer = setTimeout(() => loop(120), 380);
	};
	const click = (e: MouseEvent) => {
		if (e.detail === 0) fn();
	};
	const noMenu = (e: Event) => e.preventDefault();

	node.addEventListener('pointerdown', down);
	node.addEventListener('click', click);
	node.addEventListener('contextmenu', noMenu);
	for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'blur'] as const)
		node.addEventListener(ev, stop);

	return {
		update(next) {
			fn = next;
		},
		destroy() {
			stop();
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('click', click);
			node.removeEventListener('contextmenu', noMenu);
			for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'blur'] as const)
				node.removeEventListener(ev, stop);
		}
	};
};
