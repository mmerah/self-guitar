// Compiles content/ into generated/:
// - content.json: everything (songs with their scores and sheets, the curriculum), which the
//   self-hosted server reads from disk at startup;
// - content-index.json: what lists need (song summaries: titles, levels, chords, kinds; the
//   curriculum), which the static demo loads on start;
// - songs/<id>.json: one song each (score, sheet), which the demo fetches when the song opens.
import fs from 'node:fs';
import path from 'node:path';
import { loadSongs } from '../src/lib/content/load.ts';
import { loadLearn } from '../src/lib/content/learn.ts';
import { scoreShape } from '../src/lib/content/alphatex.ts';
import { summarize } from '../src/lib/content/summary.ts';

const root = path.resolve(import.meta.dirname, '..');
const contentDir = path.join(root, 'content');
const { songs, errors } = loadSongs(contentDir);
const learn = loadLearn(contentDir);
errors.push(...learn.errors);
if (errors.length) {
	console.error(errors.join('\n'));
	process.exit(1);
}
for (const song of songs) Object.assign(song, scoreShape(song.tex));
const outDir = path.join(root, 'generated');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
	path.join(outDir, 'content.json'),
	JSON.stringify({ songs, learn: learn.index }) + '\n'
);
fs.writeFileSync(
	path.join(outDir, 'content-index.json'),
	JSON.stringify({ songs: songs.map(summarize), learn: learn.index }) + '\n'
);
const songDir = path.join(outDir, 'songs');
fs.rmSync(songDir, { recursive: true, force: true });
fs.mkdirSync(songDir);
for (const song of songs)
	fs.writeFileSync(path.join(songDir, `${song.id}.json`), JSON.stringify(song) + '\n');
const { lessons, exercises, warmups } = learn.index;
const sheets = songs.filter((s) => s.sheet).length;
console.log(
	`content: ${songs.length} songs (${sheets} chord sheets), ${lessons.length} lessons, ${exercises.length} exercises, ${warmups.length} warm-ups -> generated/`
);
