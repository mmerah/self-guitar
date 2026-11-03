// Validates every meta.json, parses every alphaTex score with alphaTab and spell-checks chords.
import path from 'node:path';
import { loadSongs } from '../src/lib/content/load.ts';
import { checkAlphaTex } from '../src/lib/content/alphatex.ts';
import { CHORDS, checkVoicing } from '../src/lib/chords/index.ts';

const root = path.resolve(import.meta.dirname, '..');
const { songs, errors } = loadSongs(path.join(root, 'content'));
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
if (errors.length) {
	console.error(`content:check failed (${errors.length} problems)\n` + errors.join('\n'));
	process.exit(1);
}
console.log(`content:check ok: ${songs.length} songs, ${CHORDS.length} chords`);
