// Validates every meta.json, parses every alphaTex score with alphaTab, spell-checks chords and
// checks the curriculum: lesson front-matter, directives, references, coverage, prereq cycles.
import path from 'node:path';
import { loadSongs } from '../src/lib/content/load.ts';
import { checkLearnScores, loadLearn } from '../src/lib/content/learn.ts';
import { checkAlphaTex } from '../src/lib/content/alphatex.ts';
import { CHORDS, checkVoicing } from '../src/lib/chords/index.ts';

const root = path.resolve(import.meta.dirname, '..');
const contentDir = path.join(root, 'content');
const { songs, errors } = loadSongs(contentDir);
for (const song of songs) {
	for (const problem of checkAlphaTex(song.tex)) errors.push(`${song.id}/score.atex: ${problem}`);
}
for (const chord of CHORDS) {
	if (!chord.voicings.length) errors.push(`chords: ${chord.id} has no voicing`);
	chord.voicings.forEach((v, i) => {
		for (const problem of checkVoicing(chord, v))
			errors.push(`chords: ${chord.id} voicing ${i + 1}: ${problem}`);
	});
}
const learn = loadLearn(contentDir);
errors.push(...learn.errors, ...checkLearnScores(learn.index));
if (learn.warnings.length) {
	console.warn(`content:check warnings (${learn.warnings.length})\n` + learn.warnings.join('\n'));
}
if (errors.length) {
	console.error(`content:check failed (${errors.length} problems)\n` + errors.join('\n'));
	process.exit(1);
}
const { lessons, exercises } = learn.index;
console.log(
	`content:check ok: ${songs.length} songs, ${CHORDS.length} chords, ${lessons.length} lessons, ${exercises.length} exercises`
);
