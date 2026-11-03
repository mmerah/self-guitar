// Imports a MusicXML score (PDMX's .mxl, or any .musicxml/.xml/.mxl) as an auto-fingered tab:
// content/songs/<slug>/ with meta.json, score.atex and REVIEW.md (never shipped).
//
//   node --experimental-strip-types scripts/import/pdmx.mjs (--url <https://…/x.mxl> | --file <path>
//        | --tar <IMPORT_DIR/pdmx/mxl.tar.gz> --member ./mxl/1/11/Qm….mxl)
//        --slug <song-id> --level <n> [--title "…" --composer "…" --license "CC0 1.0"]
//        [--source "PDMX: …"] [--source-url <page>] [--died 1841] [--key "G major"] [--tempo 90]
//        [--shift -12] [--style folk] [--force]
//
// No Python: alphaTab reads MusicXML itself (string/fret from <technical> are kept when playable).
// A URL is downloaded into IMPORT_DIR (default data/import), as data; a local file is read in place;
// --member extracts one score from PDMX's mxl.tar.gz (Zenodo has no per-score URLs) and fills in
// title, composer and licence from docs/research/m5/pdmx-*.csv when the member is listed there.
import fs from 'node:fs';
import path from 'node:path';
import { IMPORT_LICENSE_RE, STYLES } from '../../src/lib/content/schema.ts';
import { execFileSync } from 'node:child_process';
import { download, importDir, parseFlags, root, sha256, summary, writeSong } from './common.mjs';

/** Rows of a CSV file (quoted fields with commas and "" escapes). */
function csv(text) {
	const rows = [];
	let row = [];
	let cell = '';
	let quoted = false;
	const endCell = () => {
		row.push(cell);
		cell = '';
	};
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') {
				cell += '"';
				i++;
			} else if (c === '"') quoted = false;
			else cell += c;
		} else if (c === '"') quoted = true;
		else if (c === ',') endCell();
		else if (c === '\n') {
			endCell();
			rows.push(row);
			row = [];
		} else if (c !== '\r') cell += c;
	}
	if (cell || row.length) {
		endCell();
		rows.push(row);
	}
	const [head, ...rest] = rows;
	return rest.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

/** The research CSV row for a PDMX member path (title, composer, licence), if listed. */
function pdmxRow(member) {
	for (const name of ['pdmx-guitar-subset.csv', 'pdmx-folk-subset.csv']) {
		const file = path.join(root, 'docs/research/m5', name);
		if (!fs.existsSync(file)) continue;
		const row = csv(fs.readFileSync(file, 'utf8')).find((r) => r.mxl === member);
		if (row) return row;
	}
	return null;
}

async function main() {
	const f = parseFlags(process.argv.slice(2), {
		url: 'string',
		file: 'string',
		slug: 'string',
		level: 'string',
		title: 'string',
		composer: 'string',
		license: 'string',
		source: 'string',
		'source-url': 'string',
		died: 'string',
		key: 'string',
		tempo: 'string',
		shift: 'string',
		style: 'string',
		tar: 'string',
		member: 'string',
		force: 'boolean'
	});
	if (f.member) {
		const row = pdmxRow(f.member);
		if (row) {
			f.title ??= row.title || row.song_name;
			f.composer ??= row.composer_name || 'Traditional';
			f.license ??=
				row.license === 'cc-zero'
					? 'CC0 1.0'
					: row.license === 'publicdomain'
						? 'Public Domain'
						: undefined;
			f.source ??= `PDMX (Public Domain MusicXML, Zenodo 15571083): ${f.member}`;
		}
	}
	const missing = ['slug', 'level', 'title', 'composer', 'license'].filter((k) => !f[k]);
	if (f.tar) {
		if (!f.member || !/^\.\/mxl\/[\w/]+\.mxl$/.test(f.member))
			throw new Error('--tar needs --member ./mxl/<…>.mxl');
		const out = path.join(importDir, 'pdmx');
		fs.mkdirSync(out, { recursive: true });
		execFileSync('tar', ['-xzf', path.resolve(f.tar), '-C', out, f.member], { stdio: 'inherit' });
		f.file = path.join(out, f.member);
	}
	if (!!f.url === !!f.file || missing.length)
		throw new Error(
			`usage: pdmx.mjs (--url U | --file F) --slug --level --title --composer --license … (missing: ${missing.join(', ') || 'the score'})`
		);
	if (!IMPORT_LICENSE_RE.test(f.license))
		throw new Error('--license must be Public Domain, CC0 1.0, CC BY x.y or CC BY-SA x.y');
	const style = f.style ?? 'folk';
	if (!STYLES.includes(style)) throw new Error(`--style must be one of ${STYLES.join(', ')}`);
	const file = f.url ? await download(f.url, `pdmx/${f.slug}`) : path.resolve(f.file);
	if (!/\.(mxl|musicxml|xml)$/i.test(file))
		throw new Error('expected a .mxl, .musicxml or .xml file');
	const bytes = fs.readFileSync(file);
	const level = Number(f.level);
	const sa = /^CC BY-SA/.test(f.license);
	const { report } = await writeSong({
		xmlFile: file,
		level,
		tempo: Number(f.tempo ?? 90),
		shift: f.shift === undefined ? undefined : Number(f.shift),
		force: !!f.force,
		comment: [
			`${f.title} - ${f.composer}.`,
			`Imported from MusicXML and auto-fingered for Level ${level}: see REVIEW.md.`
		],
		extra: [
			`Tempo ${f.tempo ? f.tempo : '90 (a default: check it)'}`,
			`Licence given: ${f.license}`
		],
		meta: {
			id: f.slug,
			title: f.title,
			composer: f.composer,
			style,
			...(f.key && { key: f.key }),
			source: f.source ?? `PDMX (Public Domain MusicXML): ${path.basename(file)}`,
			...((f['source-url'] ?? f.url) && { sourceUrl: f['source-url'] ?? f.url }),
			license: `${f.license} (source score); tablature ${sa ? f.license : 'CC0'}`,
			attribution: `${f.composer} - ${f.title}. Score from ${f.source ?? 'PDMX'} (${f.license}). Tablature auto-fingered by Self-Guitar${sa ? `, ${f.license}` : ''}.`,
			import: {
				via: f.url ? 'pdmx' : 'musicxml',
				file: f.url ?? path.basename(file),
				sha256: sha256(bytes),
				...(f.died && { composerDied: Number(f.died) })
			}
		}
	});
	console.log(summary(f.slug, report));
}

main().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
