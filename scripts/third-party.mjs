// Writes THIRD_PARTY_NOTICES.md (with each shipped package's full license text), its plain-text
// copy static/THIRD_PARTY_NOTICES.txt (served by both builds) and src/lib/about/third-party.json
// (the in-app attributions) from the packages the app ships, reading each one's name, version,
// license, authors and LICENSE file from node_modules. Fails when src/ imports a package that is
// not listed here, so the list stays complete. `--check` only verifies that the files are up to
// date (CI).
//   node scripts/third-party.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import * as prettier from 'prettier';

/** Packages whose code ends up in a build, and where. */
const SHIPPED = [
	// Browser app (both builds)
	['svelte', 'app'],
	['clsx', 'app'],
	['esm-env', 'app'],
	['@sveltejs/kit', 'app, server'],
	['devalue', 'app, server'],
	['@coderline/alphatab', 'app'],
	['svguitar', 'app'],
	['@svgdotjs/svg.js', 'app'],
	['roughjs', 'app'],
	['pitchy', 'app'],
	['fft.js', 'app'],
	['zod', 'app, server'],
	['drizzle-orm', 'server, demo'],
	['workbox-window', 'app'],
	['workbox-core', 'service worker'],
	['workbox-precaching', 'service worker'],
	['workbox-routing', 'service worker'],
	['workbox-strategies', 'service worker'],
	['workbox-cacheable-response', 'service worker'],
	['workbox-range-requests', 'service worker'],
	// Self-hosted server
	['@sveltejs/adapter-node', 'server'],
	['better-sqlite3', 'server'],
	['bindings', 'server'],
	['file-uri-to-path', 'server'],
	['cookie', 'server'],
	['set-cookie-parser', 'server'],
	['sirv', 'server'],
	['@polka/url', 'server'],
	['mrmime', 'server'],
	['totalist', 'server'],
	// Static demo
	['sql.js', 'demo']
];
/** Imported by src/ but only used at build time (content compiler, virtual modules). */
const BUILD_ONLY = ['yaml'];

const root = path.resolve(import.meta.dirname, '..');
const check = process.argv.includes('--check');

function pkg(name) {
	const p = JSON.parse(
		fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')
	);
	const person = (a) => (typeof a === 'string' ? a.replace(/\s*[<(].*$/, '') : a?.name);
	const repo = typeof p.repository === 'string' ? p.repository : p.repository?.url;
	const url = (repo ?? p.homepage ?? `https://www.npmjs.com/package/${name}`)
		.replace(/^git\+/, '')
		.replace(/^(?:git|ssh):\/\/(?:git@)?/, 'https://')
		.replace(/^http:/, 'https:')
		.replace(/^github:/, 'https://github.com/')
		.replace(/\.git$/, '');
	return {
		name: p.name,
		version: p.version,
		license: p.license ?? 'see package',
		author: person(p.author) ?? null,
		url: /^https?:/.test(url) ? url : `https://github.com/${url}`
	};
}

/** Bare package names imported anywhere in src/. */
function importedPackages() {
	const found = new Set();
	const walk = (dir) => {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			const p = path.join(dir, e.name);
			if (e.isDirectory()) walk(p);
			else if (/\.(ts|js|svelte)$/.test(e.name)) {
				const text = fs.readFileSync(p, 'utf8');
				const specs =
					/^\s*import\s*['"]([^'"]+)['"]|^\s*(?:import|export)\s[^'";=()]*?\sfrom\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]/gm;
				for (const m of text.matchAll(specs)) {
					const spec = m[1] ?? m[2] ?? m[3];
					if (/^(\.|\$|\/|node:|virtual:)/.test(spec)) continue;
					found.add(
						spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
					);
				}
			}
		}
	};
	walk(path.join(root, 'src'));
	return found;
}

/** The package's own license file, or the standard text for its declared license. */
function licenseText(name, info) {
	const dir = path.join(root, 'node_modules', name);
	const file = fs
		.readdirSync(dir)
		.filter((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f))
		.sort()[0];
	if (file) return fs.readFileSync(path.join(dir, file), 'utf8').trim();
	// No license file in the published package: the standard text, with its declared author.
	if (info.license === 'MIT') return `MIT License\n\nCopyright (c) ${info.author}\n\n${MIT_BODY}`;
	if (info.license === 'Apache-2.0')
		return fs.readFileSync(path.join(root, 'node_modules/typescript/LICENSE.txt'), 'utf8').trim();
	throw new Error(`${name}: no license file and no standard text for ${info.license}`);
}

const MIT_BODY = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

/** A fenced block that no line of the text can close. */
const fence = (text) => {
	const ticks = '`'.repeat(
		Math.max(3, ...[...text.matchAll(/`{3,}/g)].map((m) => m[0].length + 1))
	);
	return `${ticks}text\n${text}\n${ticks}`;
};

const listed = new Set(SHIPPED.map(([n]) => n));
const missing = [...importedPackages()].filter((n) => !listed.has(n) && !BUILD_ONLY.includes(n));
if (missing.length) {
	console.error(
		`src/ imports packages missing from scripts/third-party.mjs: ${missing.join(', ')}`
	);
	process.exit(1);
}

const packages = SHIPPED.map(([name, use]) => ({ ...pkg(name), use })).sort((a, b) =>
	a.name.localeCompare(b.name)
);

const ALPHATAB = packages.find((p) => p.name === '@coderline/alphatab');

/** Bundled assets that are not npm packages of their own (shipped with alphaTab). */
const assets = [
	{
		name: 'alphaTab',
		license: 'MPL-2.0',
		holder: '© Daniel Kuschny and contributors',
		note: `Version ${ALPHATAB.version}, used unmodified. Source: https://github.com/CoderLine/alphaTab`,
		url: 'https://github.com/CoderLine/alphaTab'
	},
	{
		name: 'SONiVOX EAS SoundFont (sonivox.sf3), as shipped by alphaTab',
		license: 'Apache-2.0',
		holder: '© 2004–2006 Sonic Network Inc.',
		note: 'The musical-artifacts.com #1517 repack of the SONiVOX EAS General MIDI bank (Android Open Source Project).',
		url: 'https://musical-artifacts.com/artifacts/1517'
	},
	{
		name: 'Bravura music font, as shipped by alphaTab',
		license: 'OFL-1.1',
		holder: '© Steinberg Media Technologies GmbH',
		note: 'SIL Open Font License 1.1; the license text ships next to the font (font/Bravura-OFL.txt).',
		url: 'https://github.com/steinbergmedia/bravura'
	},
	{
		name: 'SQLite, compiled to WebAssembly in sql.js (demo only)',
		license: 'Public domain',
		holder: 'SQLite authors (D. Richard Hipp and others)',
		note: 'Dedicated to the public domain by its authors.',
		url: 'https://sqlite.org/copyright.html'
	}
];

const content = [
	{ name: 'Application code', license: 'MIT', file: 'LICENSE' },
	{
		name: 'Lessons, exercises and curriculum (content/)',
		license: 'CC BY-SA 4.0',
		file: 'content/LICENSE'
	},
	{
		name: 'Song arrangements',
		license: 'CC0 1.0; the compositions are public domain',
		file: 'content/LICENSE'
	}
];

const markdown = `# Third-party notices

Self-Guitar's own code is MIT licensed (see \`LICENSE\`); its lessons, exercises and curriculum are
CC BY-SA 4.0 and its song arrangements CC0 (see \`content/LICENSE\`). It ships the third-party
software and assets below, under their own licenses.

<!-- Generated by scripts/third-party.mjs from node_modules: edit that script, not this file. -->

## Bundled assets

${assets.map((a) => `### ${a.name}\n\n- License: ${a.license}\n- ${a.holder}\n- ${a.note}\n- ${a.url}`).join('\n\n')}

The SoundFont is distributed under this notice:

${fence(fs.readFileSync(path.join(root, 'node_modules/@coderline/alphatab/dist/soundfont/LICENSE'), 'utf8').trim())}

The Bravura font is distributed under this license:

${fence(fs.readFileSync(path.join(root, 'node_modules/@coderline/alphatab/dist/font/Bravura-OFL.txt'), 'utf8').trim())}

## Software packages

"Used in": app = the browser app (both builds), server = the self-hosted Node server, demo = the
static demo, service worker = the offline cache.

| Package | Version | License | Author | Used in |
| --- | --- | --- | --- | --- |
${packages.map((p) => `| [${p.name}](${p.url}) | ${p.version} | ${p.license} | ${p.author ?? ''} | ${p.use} |`).join('\n')}

## License texts

Each package's license, as published in the package (or, for the few that publish none, the
standard text of their declared license with their declared author).

${packages.map((p) => `### ${p.name} ${p.version}\n\n${fence(licenseText(p.name, p))}`).join('\n\n')}
`;

const json = JSON.stringify({ content, assets, packages });

const notices = await prettier.format(markdown, {
	...(await prettier.resolveConfig('THIRD_PARTY_NOTICES.md')),
	filepath: path.join(root, 'THIRD_PARTY_NOTICES.md')
});
const outputs = [
	[path.join(root, 'THIRD_PARTY_NOTICES.md'), notices],
	// Served next to the app (both builds), linked from the About page.
	[path.join(root, 'static/THIRD_PARTY_NOTICES.txt'), notices],
	[
		path.join(root, 'src/lib/about/third-party.json'),
		await prettier.format(json, {
			...(await prettier.resolveConfig('third-party.json')),
			filepath: path.join(root, 'src/lib/about/third-party.json')
		})
	]
];

let stale = false;
for (const [file, formatted] of outputs) {
	const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
	if (current === formatted) continue;
	if (check) {
		console.error(`${path.relative(root, file)} is out of date: run npm run third-party`);
		stale = true;
	} else {
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, formatted);
		console.log(`wrote ${path.relative(root, file)}`);
	}
}
if (stale) process.exit(1);
