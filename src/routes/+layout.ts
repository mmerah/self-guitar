// Client-rendered app shell: the PWA service worker serves the prerendered "/" shell offline
// for every route, and pages load their data from the JSON API (runtime-cached).
export const ssr = false;
// The static demo prerenders every page's shell, so each URL is a real file on the static host.
export const prerender = __DEMO__;
