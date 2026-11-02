// Client-rendered app shell: the PWA service worker serves the prerendered "/" shell offline
// for every route, and pages load their data from the JSON API (runtime-cached).
export const ssr = false;
