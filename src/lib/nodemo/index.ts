// The self-hosted build resolves every $lib/demo module (but the flag) here (vite.config.ts), so
// none of the demo's code or assets (sql.js, its WebAssembly, the content bundle) ship with it.
const off = (): never => {
	throw new Error('Only in the demo build');
};
export const handle = off;
export const demoDb = off;
export const resetDemo = off;
export const loadSampleProgress = off;
