// Validates every meta.json against the schema and parses every alphaTex score with alphaTab.
import path from 'node:path';
import { loadSongs } from '../src/lib/content/load.ts';
import { checkAlphaTex } from '../src/lib/content/alphatex.ts';

const root = path.resolve(import.meta.dirname, '..');
const { songs, errors } = loadSongs(path.join(root, 'content'));
for (const song of songs) {
	for (const problem of checkAlphaTex(song.tex)) errors.push(`${song.id}/score.atex: ${problem}`);
}
if (errors.length) {
	console.error(`content:check failed (${errors.length} problems)\n` + errors.join('\n'));
	process.exit(1);
}
console.log(`content:check ok: ${songs.length} songs`);
