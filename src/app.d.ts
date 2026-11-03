/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/info" />
// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	/** The static demo build (DEMO=1): no server, the API runs in the browser. */
	const __DEMO__: boolean;
	/** The source repository's URL (REPO_URL at build time). */
	const __REPO_URL__: string;
	namespace App {}
}

export {};
