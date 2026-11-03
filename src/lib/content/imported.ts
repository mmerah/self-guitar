// content:check rules for imported (auto-fingered) tabs, on top of every score's checks: the
// level's fret cap, at most four notes at once below Level 5, a string for every note, and the
// licence and provenance fields an import must carry.
import * as alphaTab from '@coderline/alphatab';
import { fretCap, noteCap } from '../import/fingering.ts';
import { AUTO_ARRANGER, IMPORT_LICENSE_RE, type SongMeta } from './schema.ts';

/** Problems with an imported song (empty when it passes). `year` = the current year. */
export function importProblems(
	meta: SongMeta,
	tex: string,
	year = new Date().getFullYear()
): string[] {
	const out: string[] = [];
	const imported = !!meta.import || meta.arranger === AUTO_ARRANGER;
	if (!imported) return out;
	if (!meta.import) out.push('meta.json: an auto-fingered song needs "import" (via, file, sha256)');
	if (meta.arranger !== AUTO_ARRANGER)
		out.push(`meta.json: arranger of an import is "${AUTO_ARRANGER}"`);
	if (!IMPORT_LICENSE_RE.test(meta.license))
		out.push(
			'meta.json: license must start with Public Domain, CC0 1.0, CC BY x.y or CC BY-SA x.y'
		);
	if (/BY-SA/.test(meta.license) && /CC0/.test(meta.license))
		out.push('meta.json: a CC BY-SA source cannot be relicensed CC0 (keep CC BY-SA)');
	if (!meta.sourceUrl) out.push('meta.json: sourceUrl is required for an import');
	if (!/^https?:/.test(meta.import?.file ?? 'https:') && meta.import?.via !== 'musicxml')
		out.push('meta.json: import.file must be the URL that was downloaded');
	const died = meta.import?.composerDied;
	if (died !== undefined && died > year - 71)
		out.push(`meta.json: the composer died in ${died}: not public domain yet`);

	let score: alphaTab.model.Score;
	try {
		score = alphaTab.importer.ScoreLoader.loadAlphaTex(tex, new alphaTab.Settings());
	} catch {
		return out; // checkAlphaTex reports the parse error
	}
	const cap = fretCap(meta.level);
	const maxNotes = noteCap(meta.level);
	const high = new Set<number>();
	const crowded = new Set<number>();
	const pitched = new Set<number>();
	for (const track of score.tracks)
		for (const staff of track.staves)
			for (const bar of staff.bars) {
				// Notes struck at the same time, across voices.
				const at = new Map<number, number>();
				for (const voice of bar.voices)
					for (const beat of voice.beats)
						for (const note of beat.notes) {
							if (!note.isStringed || note.string < 1) pitched.add(bar.index + 1);
							else if (note.fret > cap) high.add(bar.index + 1);
							if (!note.isTieDestination)
								at.set(beat.playbackStart, (at.get(beat.playbackStart) ?? 0) + 1);
						}
				if ([...at.values()].some((n) => n > maxNotes)) crowded.add(bar.index + 1);
			}
	const bars = (s: Set<number>) => [...s].slice(0, 8).join(', ') + (s.size > 8 ? '…' : '');
	if (pitched.size)
		out.push(`score.atex: bars ${bars(pitched)} have notes without a string (write fret.string)`);
	if (high.size)
		out.push(
			`score.atex: bars ${bars(high)} go above fret ${cap}, the cap for Level ${meta.level} (re-finger or raise the level)`
		);
	if (crowded.size)
		out.push(
			`score.atex: bars ${bars(crowded)} strike more than ${maxNotes} notes at once (Level ${meta.level})`
		);
	return out;
}
