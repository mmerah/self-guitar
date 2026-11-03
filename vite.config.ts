import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { alphaTab } from '@coderline/alphatab-vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';

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

export default defineConfig(({ command }) => ({
	plugins: [
		tailwindcss(),
		// Copies alphaTab's Bravura font + SONiVOX SoundFont into static/ and wires up its workers.
		alphaTab(),
		soundFontAsBin,
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			injectRegister: false,
			manifest: {
				name: 'Self-Guitar',
				short_name: 'Self-Guitar',
				description: 'Learn acoustic guitar: tab player, curriculum and daily practice.',
				theme_color: '#111318',
				background_color: '#111318',
				display: 'standalone',
				orientation: 'any',
				start_url: '/',
				scope: '/',
				icons: [
					{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
					{
						src: '/icon-512-maskable.png',
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
					'client/font/Bravura.woff2'
				],
				// Other alphaTab assets (unused formats, the .sf2) are cached on first use, if ever.
				globIgnores: ['**/font/Bravura.svg', '**/soundfont/*.sf2'],
				additionalManifestEntries: [{ url: '/api/learn', revision: contentRevision(command) }],
				maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
				navigateFallback: '/',
				navigateFallbackDenylist: [/^\/api\//],
				runtimeCaching: [
					{
						urlPattern: ({ url }) =>
							url.pathname.startsWith('/soundfont/') || url.pathname.startsWith('/font/'),
						handler: 'CacheFirst',
						options: {
							cacheName: `alphatab-assets-${alphaTabVersion}`,
							cacheableResponse: { statuses: [200] },
							rangeRequests: true
						}
					},
					{
						urlPattern: ({ url }) =>
							url.pathname.startsWith('/api/songs') && !url.pathname.endsWith('/progress'),
						handler: 'StaleWhileRevalidate',
						options: { cacheName: 'songs', cacheableResponse: { statuses: [200] } }
					},
					{
						urlPattern: ({ url }) =>
							url.pathname.endsWith('/progress') ||
							url.pathname === '/api/chord-changes' ||
							/^\/api\/exercises\/[^/]+$/.test(url.pathname),
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
