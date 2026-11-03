// Validates every meta.json, parses every alphaTex score with alphaTab (including the strummed
// accompaniment generated from each song.cho), spell-checks chords, applies the import rules to
// auto-fingered tabs and checks the curriculum: lesson front-matter, directives, references,
// coverage, prereq cycles, warm-up routines.
import fs from 'node:fs';
import path from 'node:path';
import { loadSongs } from '../src/lib/content/load.ts';
import { checkLearnScores, loadLearn } from '../src/lib/content/learn.ts';
import { checkAlphaTex } from '../src/lib/content/alphatex.ts';
import { importProblems } from '../src/lib/content/imported.ts';
import { CHORDS, checkVoicing } from '../src/lib/chords/index.ts';

const root = path.resolve(import.meta.dirname, '..');
const contentDir = path.join(root, 'content');
const { songs, errors, warnings } = loadSongs(contentDir);
const awaiting: string[] = [];
for (const song of songs) {
	const file = song.hasTab ? 'score.atex' : 'song.cho (generated accompaniment)';
	for (const problem of checkAlphaTex(song.tex)) errors.push(`${song.id}/${file}: ${problem}`);
	for (const problem of importProblems(song, song.tex)) errors.push(`songs/${song.id}/${problem}`);
	const review = path.join(contentDir, 'songs', song.id, 'REVIEW.md');
	if (fs.existsSync(review) && /- \[ \]/.test(fs.readFileSync(review, 'utf8')))
		awaiting.push(song.id);
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
warnings.push(...learn.warnings);
if (awaiting.length)
	warnings.push(`imports awaiting review (REVIEW.md unticked): ${awaiting.join(', ')}`);
if (warnings.length) {
	console.warn(`content:check warnings (${warnings.length})\n` + warnings.join('\n'));
}
if (errors.length) {
	console.error(`content:check failed (${errors.length} problems)\n` + errors.join('\n'));
	process.exit(1);
}
const { lessons, exercises, warmups } = learn.index;
const sheets = songs.filter((s) => s.sheet).length;
console.log(
	`content:check ok: ${songs.length} songs (${sheets} chord sheets), ${CHORDS.length} chords, ${lessons.length} lessons, ${exercises.length} exercises, ${warmups.length} warm-ups`
);
