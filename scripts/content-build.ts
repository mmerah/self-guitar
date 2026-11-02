// Compiles content/ into generated/content.json, which the server reads from disk at startup.
import fs from 'node:fs';
import path from 'node:path';
import { loadSongs } from '../src/lib/content/load.ts';
import { scoreShape } from '../src/lib/content/alphatex.ts';

const root = path.resolve(import.meta.dirname, '..');
const { songs, errors } = loadSongs(path.join(root, 'content'));
if (errors.length) {
	console.error(errors.join('\n'));
	process.exit(1);
}
for (const song of songs) Object.assign(song, scoreShape(song.tex));
const outDir = path.join(root, 'generated');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'content.json'), JSON.stringify({ songs }) + '\n');
console.log(`content: ${songs.length} songs -> generated/content.json`);
