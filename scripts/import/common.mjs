// Shared by the import scripts: downloads (into IMPORT_DIR, never run), hashing, the song folder
// they write (meta.json, score.atex, REVIEW.md) and the review checklist.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as prettier from 'prettier';
import { AUTO_ARRANGER, songMetaSchema } from '../../src/lib/content/schema.ts';
import { importScore, loadScore } from '../../src/lib/import/score.ts';

export const root = path.resolve(import.meta.dirname, '../..');
/** Raw downloads: untrusted data, kept out of the repo (default: data/import, gitignored). */
export const importDir = path.resolve(process.env.IMPORT_DIR ?? path.join(root, 'data/import'));

export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

/** Downloads `url` into `<IMPORT_DIR>/<sub>/<file name>` (reused when already there). */
export async function download(url, sub) {
	const dir = path.join(importDir, sub);
	fs.mkdirSync(dir, { recursive: true });
	const file = path.join(dir, path.basename(new URL(url).pathname));
	if (!fs.existsSync(file)) {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
		fs.writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
	}
	return file;
}

export async function fetchText(url) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
	return res.text();
}

/**
 * MIDI → MusicXML with music21 in a virtualenv: IMPORT_PYTHON names its python (default python3).
 * Isolated mode (-I), the paths as arguments, run from the repo root: nothing downloaded runs.
 * `pickup`: the length of an opening pickup in quarters (LilyPond \partial; MIDI drops it).
 */
export function midiToMusicXml(mid, pickup) {
	const out = mid.replace(/\.midi?$/i, '') + '.musicxml';
	const python = process.env.IMPORT_PYTHON ?? 'python3';
	const args = [path.join(root, 'scripts/import/midi2musicxml.py'), mid, out];
	// A pickup (in quarters): the MIDI starts on it, so its notes are delayed to end bar 1.
	if (pickup) args.push(String(pickup));
	execFileSync(python, ['-I', ...args], {
		cwd: root,
		stdio: ['ignore', 'ignore', 'inherit']
	});
	return out;
}

const KEY_NAMES = [
	'Cb',
	'Gb',
	'Db',
	'Ab',
	'Eb',
	'Bb',
	'F',
	'C',
	'G',
	'D',
	'A',
	'E',
	'B',
	'F#',
	'C#'
];
const MINOR = ['Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#'];

/** "C major" / "A minor" from the score's first key signature. */
export function scoreKey(score) {
	const mb = score.masterBars[0];
	const k = Number(mb.keySignature) + 7;
	return Number(mb.keySignatureType) === 1 ? `${MINOR[k]} minor` : `${KEY_NAMES[k]} major`;
}

/** Strict command-line flags: --name value (or --flag for booleans). */
export function parseFlags(argv, spec) {
	const out = { _: [] };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (!a.startsWith('--')) {
			out._.push(a);
			continue;
		}
		const name = a.slice(2);
		if (!(name in spec))
			throw new Error(
				`unknown flag --${name} (known: ${Object.keys(spec)
					.map((k) => `--${k}`)
					.join(' ')})`
			);
		out[name] = spec[name] === 'boolean' ? true : argv[++i];
		if (out[name] === undefined) throw new Error(`--${name} needs a value`);
	}
	return out;
}

/** The checklist a reviewer works through before the import counts as done (never shipped). */
function review(meta, report, extra) {
	const flagged = report.flagged.length
		? report.flagged.map((f) => `  - bar ${f.bar}: ${f.reason}`).join('\n')
		: '  - none';
	return `# Review: ${meta.title}

Auto-imported by \`scripts/import\` (${meta.import.via}). Not shipped: content:build ignores this file.
Delete it once every box is ticked (content:check lists the imports still waiting).

- Source: ${meta.sourceUrl ?? meta.import.file}
- File: ${meta.import.file} (sha256 ${meta.import.sha256.slice(0, 12)}…)
- Level ${meta.level}: frets capped at ${report.maxFret}; highest fret used ${report.highest}
- Octave shift ${report.shift} · ${report.bars} bars · ${report.onsets} onsets · ${report.dropped} notes left out
${extra.map((e) => `- ${e}`).join('\n')}
- Flagged:
${flagged}

## Checklist

- [ ] Plays back like the source (PDF/scan) at 60 % tempo: pitches, rhythm, ties, repeats.
- [ ] Time and key signature, pickup and bar count match the source.
- [ ] Fingering is idiomatic: open strings ring where intended, bass on p, no impossible stretch.
- [ ] Level is right (max fret, chords, tempo) compared with two songs of that level.
- [ ] Tempo is the piece's own (not a MIDI default).
- [ ] Title, composer (dates), opus/number and the source edition are correct.
- [ ] Licence and attribution are right (typesetter named; CC BY-SA kept as CC BY-SA).
- [ ] Renders on a 360 px phone without overlapping tab numbers.
`;
}

/**
 * Converts a MusicXML file and writes content/songs/<id>/{meta.json, score.atex, REVIEW.md}.
 * Refuses to overwrite a song unless `force` (a reviewed song may have hand edits).
 */
export async function writeSong({
	xmlFile,
	meta,
	level,
	tempo,
	shift,
	force,
	comment,
	extra = []
}) {
	const dir = path.join(root, 'content/songs', meta.id);
	if (fs.existsSync(dir) && !force)
		throw new Error(`content/songs/${meta.id} exists: pass --force to overwrite`);
	const score = loadScore(new Uint8Array(fs.readFileSync(xmlFile)));
	const fullMeta = {
		...meta,
		arranger: AUTO_ARRANGER,
		level,
		key: meta.key ?? scoreKey(score),
		play: 'fingerstyle'
	};
	const parsed = songMetaSchema.safeParse(fullMeta);
	if (!parsed.success)
		throw new Error(
			`meta.json: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
		);
	const { tex, report } = importScore(score, {
		level,
		title: meta.title,
		composer: meta.composer,
		tempo,
		shift,
		comment
	});
	if (report.problems.length) throw new Error(`conversion failed:\n${report.problems.join('\n')}`);
	fs.mkdirSync(dir, { recursive: true });
	// In the repo's own style (npm run lint checks it).
	const pretty = async (file, text) =>
		prettier.format(text, { ...(await prettier.resolveConfig(file)), filepath: file });
	const metaFile = path.join(dir, 'meta.json');
	const reviewFile = path.join(dir, 'REVIEW.md');
	fs.writeFileSync(metaFile, await pretty(metaFile, JSON.stringify(parsed.data, null, '\t')));
	fs.writeFileSync(path.join(dir, 'score.atex'), tex);
	fs.writeFileSync(reviewFile, await pretty(reviewFile, review(parsed.data, report, extra)));
	return { dir, report };
}

/** One-line summary for the terminal. */
export const summary = (id, r) =>
	`${id}: ${r.bars} bars, ${r.onsets} onsets, shift ${r.shift}, highest fret ${r.highest}/${r.maxFret}, ${r.dropped} dropped, ${r.flagged.length} flagged -> content/songs/${id}/ (see REVIEW.md)`;
