// The listening code behind the Mic toggle, loaded on first use (a dynamic import from
// LadderPanel): the checker, matching, the worklet loader, pitch and chroma, the note overlay
// and the calibration sheet. Nothing here ships with a player page until Mic is turned on.
export { ListenController } from './controller.svelte';
export { requestMicPermission } from './mic';
export { summaryText } from './match';
export { default as Calibrate } from './Calibrate.svelte';

// A hook for end-to-end tests: the listening code is on the page only once Mic was turned on.
if (typeof document !== 'undefined') document.documentElement.dataset.listenCode = 'loaded';
