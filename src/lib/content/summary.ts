// A song's list entry (the Library, the planner, the demo's content index): its meta and shape,
// with a chord sheet's chords; no score or sheet body.
import type { Song, SongCredit, SongSummary } from './schema.ts';

export function summarize(song: Song): SongSummary {
	const {
		tex: _tex,
		sheet,
		import: _import,
		source: _source,
		sourceUrl: _sourceUrl,
		license: _license,
		attribution: _attribution,
		...meta
	} = song;
	return { ...meta, ...(sheet && { chords: sheet.chords }) };
}

/** A song's source and license, for the attributions page. */
export const creditOf = (s: Song): SongCredit => ({
	id: s.id,
	title: s.title,
	composer: s.composer,
	arranger: s.arranger,
	source: s.source,
	...(s.sourceUrl && { sourceUrl: s.sourceUrl }),
	license: s.license,
	attribution: s.attribution
});
