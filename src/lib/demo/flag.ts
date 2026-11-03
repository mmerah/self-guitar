// Build-time constants (vite `define`): DEMO is true only in the static demo build (DEMO=1);
// REPO_URL is the source repository (REPO_URL at build time, set by the Pages workflow).
export const DEMO: boolean = __DEMO__;
export const REPO_URL: string = __REPO_URL__;
