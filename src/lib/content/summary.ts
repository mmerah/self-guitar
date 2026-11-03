// A song's list entry (the Library, the planner, the demo's content index): its meta and shape,
// with a chord sheet's chords; no score or sheet body.
import type { Song, SongSummary } from './schema.ts';

export function summarize(song: Song): SongSummary {
	const { tex: _tex, sheet, import: _import, ...meta } = song;
	return { ...meta, ...(sheet && { chords: sheet.chords }) };
}
