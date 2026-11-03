import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { alphaTab } from '@coderline/alphatab-vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

// DEMO=1: the static demo build (see svelte.config.js); BASE_PATH: the app's sub-path.
const DEMO = process.env.DEMO === '1';
const BASE = (process.env.BASE_PATH ?? (DEMO ? '/self-guitar' : '')).replace(/\/$/, '');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A same-origin URL whose path (under the base path) matches `path` (a regex source). */
const under = (path: string) => new RegExp(`^https?://[^/]+${esc(BASE)}${path}`);

const alphaTabDist = 'node_modules/@coderline/alphatab/dist';
const alphaTabVersion: string = JSON.parse(
	fs.readFileSync('node_modules/@coderline/alphatab/package.json', 'utf8')
).version;

// The curriculum index (lessons + exercises) is precached so every lesson opens offline; its
// revision follows the compiled content (content:build runs before vite build). A build without
// it fails: a fixed revision would keep serving a stale curriculum to installed apps.
function contentRevision(command: 'build' | 'serve') {
	try {
		return crypto
			.createHash('sha256')
			.update(fs.readFileSync('generated/content.json'))
			.digest('hex');
	} catch (e) {
		if (command === 'build')
			throw new Error(`generated/content.json is missing: run npm run content:build (${e})`);
		return 'dev';
	}
}

// adapter-node's static server has no MIME type for .sf3 (it sends an empty Content-Type), so the
// SoundFont is also published as .bin, which it serves as application/octet-stream.
const soundFontAsBin: Plugin = {
	name: 'soundfont-as-bin',
	buildStart() {
		fs.mkdirSync('static/soundfont', { recursive: true });
		fs.copyFileSync(`${alphaTabDist}/soundfont/sonivox.sf3`, 'static/soundfont/sonivox.sf3.bin');
	}
};

// Outside the demo, $lib/demo/* (but the flag) resolves to a stub: no sql.js, WebAssembly or
// content.json in the self-hosted build. (A plugin, not resolve.alias: SvelteKit's own $lib alias
// is applied first.)
const demoDir = path.resolve('src/lib/demo') + path.sep;
const noDemo: Plugin = {
	name: 'no-demo',
	enforce: 'pre',
	resolveId(id) {
		if (!id.startsWith(demoDir) || /[/\\]flag(\.ts)?$/.test(id)) return;
		return path.resolve(
			id.endsWith('.svelte') ? 'src/lib/nodemo/Empty.svelte' : 'src/lib/nodemo/index.ts'
		);
	}
};

export default defineConfig(({ command }) => ({
	// The demo's song files stay files (fetched on demand), never inlined into a script.
	build: { assetsInlineLimit: (file: string) => (file.endsWith('.json') ? false : undefined) },
	define: {
		__DEMO__: JSON.stringify(DEMO),
		__REPO_URL__: JSON.stringify(process.env.REPO_URL || 'https://github.com/mmerah/self-guitar')
	},
	plugins: [
		...(DEMO ? [] : [noDemo]),
		tailwindcss(),
		// Copies alphaTab's Bravura font + SONiVOX SoundFont into static/ and wires up its workers.
		alphaTab(),
		soundFontAsBin,
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			injectRegister: false,
			base: `${BASE}/`,
			scope: `${BASE}/`,
			kit: { base: `${BASE}/` },
			manifest: {
				name: 'Self-Guitar',
				short_name: 'Guitar',
				description: 'Learn acoustic guitar: tab player, curriculum and daily practice.',
				theme_color: '#111318',
				background_color: '#111318',
				display: 'standalone',
				orientation: 'any',
				start_url: `${BASE}/`,
				scope: `${BASE}/`,
				icons: [
					{ src: `${BASE}/icon-192.png`, sizes: '192x192', type: 'image/png' },
					{ src: `${BASE}/icon-512.png`, sizes: '512x512', type: 'image/png' },
					{
						src: `${BASE}/icon-512-maskable.png`,
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			},
			workbox: {
				globPatterns: [
					'client/**/*.{js,css,ico,png,svg,webmanifest}',
					'prerendered/**/*.html',
					// Precached so a fresh install can play offline before the first song is opened.
					'client/soundfont/sonivox.sf3.bin',
					'client/font/Bravura.woff2',
					// The demo's database engine and content index (no server to fetch them from);
					// each song's own file is cached when it is first opened.
					...(DEMO
						? [
								'client/_app/immutable/**/*.wasm',
								'client/_app/immutable/assets/content-index.*.json'
							]
						: [])
				],
				// Other alphaTab assets (unused formats, the .sf2) are cached on first use, if ever.
				globIgnores: ['**/font/Bravura.svg', '**/soundfont/*.sf2'],
				additionalManifestEntries: DEMO
					? []
					: [
							{ url: `${BASE}/api/learn`, revision: contentRevision(command) },
							{ url: `${BASE}/api/songs`, revision: contentRevision(command) }
						],
				maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
				navigateFallback: `${BASE}/`,
				navigateFallbackDenylist: [new RegExp(`^${esc(BASE)}/api/`)],
				// Patterns are regexes (functions could not see BASE once serialized into the worker).
				runtimeCaching: [
					{
						urlPattern: under('/(?:soundfont|font)/'),
						handler: 'CacheFirst',
						options: {
							cacheName: `alphatab-assets-${alphaTabVersion}`,
							cacheableResponse: { statuses: [200] },
							rangeRequests: true
						}
					},
					{
						// The demo's song files (hashed, immutable): cached when a song is opened.
						urlPattern: under('/_app/immutable/assets/[^/]+\\.json$'),
						handler: 'CacheFirst',
						options: { cacheName: 'song-files', cacheableResponse: { statuses: [200] } }
					},
					{
						// The song list and each song (not their progress).
						urlPattern: under('/api/songs(?:/[^/?#]+)?/?(?:[?#]|$)'),
						handler: 'StaleWhileRevalidate',
						options: { cacheName: 'songs', cacheableResponse: { statuses: [200] } }
					},
					{
						urlPattern: under(
							'/api/(?:progress|learn/progress|songs/[^/?#]+/progress|chord-changes|exercises/[^/?#]+)/?(?:[?#]|$)'
						),
						handler: 'NetworkFirst',
						method: 'GET',
						options: { cacheName: 'progress', networkTimeoutSeconds: 3 }
					}
				]
			}
		})
	],
	test: {
		include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
		environment: 'node'
	}
}));
