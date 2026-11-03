// Re-fingers a song's tab (content/songs/<id>/score.atex) for a level, with the same Viterbi as the
// importers: after raising or lowering an import's level, or to check a hand-made tab.
//
//   node --experimental-strip-types scripts/import/fingering.mjs <song-id> --level <n> [--write]
//
// Prints the report (highest fret, flagged bars); --write replaces score.atex (keeping its leading
// comment lines) and sets the level in meta.json.
import fs from 'node:fs';
import path from 'node:path';
import { emitTex, fingerScore, loadTex } from '../../src/lib/import/score.ts';
import { checkAlphaTex } from '../../src/lib/content/alphatex.ts';
import { parseFlags, root } from './common.mjs';

const f = parseFlags(process.argv.slice(2), { level: 'string', write: 'boolean' });
const id = f._[0];
if (!id || !f.level) {
	console.error('usage: fingering.mjs <song-id> --level <n> [--write]');
	process.exit(1);
}
const dir = path.join(root, 'content/songs', id);
const src = fs.readFileSync(path.join(dir, 'score.atex'), 'utf8');
const score = loadTex(src);
const level = Number(f.level);
// The tab is already at sounding pitch on the guitar: no octave shift.
const report = fingerScore(score, level, { shift: 0 });
const comment = src
	.split('\n')
	.filter((l) => l.startsWith('//'))
	.map((l) => l.replace(/^\/\/\s?/, ''));
const tex = emitTex(score, {
	title: score.title,
	composer: score.music,
	tempo: score.tempo,
	comment
});
const problems = checkAlphaTex(tex);
console.log(
	`${id}: level ${level}, highest fret ${report.highest}/${report.maxFret}, ${report.dropped} dropped, ${report.flagged.length} flagged`
);
for (const x of report.flagged) console.log(`  bar ${x.bar}: ${x.reason}`);
if (problems.length) {
	console.error(problems.join('\n'));
	process.exit(1);
}
if (f.write) {
	fs.writeFileSync(path.join(dir, 'score.atex'), tex);
	const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
	meta.level = level;
	fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, '\t') + '\n');
	console.log(`wrote content/songs/${id}/score.atex`);
}
