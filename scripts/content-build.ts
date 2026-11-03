// Compiles content/ into generated/content.json, which the server reads from disk at startup:
// songs, plus the curriculum index (levels, compiled lessons, exercises).
import fs from 'node:fs';
import path from 'node:path';
import { loadSongs } from '../src/lib/content/load.ts';
import { loadLearn } from '../src/lib/content/learn.ts';
import { scoreShape } from '../src/lib/content/alphatex.ts';

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
const { lessons, exercises } = learn.index;
console.log(
	`content: ${songs.length} songs, ${lessons.length} lessons, ${exercises.length} exercises -> generated/content.json`
);
