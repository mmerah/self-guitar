// What a song page shows (M7.1): the lyrics with chords, the tab alone (no lyric lines: the
// chord-diagram strip, strum row and full-height tablature), or both stacked. One global choice
// per device: the next song opens the same way.

export type SongView = 'lyrics' | 'tab' | 'both';

export const SONG_VIEWS: SongView[] = ['lyrics', 'tab', 'both'];
export const SONG_VIEW_LABEL: Record<SongView, string> = {
	lyrics: 'Lyrics',
	tab: 'Tab',
	both: 'Both'
};

const KEY = 'sg:song-view';

const isView = (v: unknown): v is SongView => SONG_VIEWS.includes(v as SongView);

export function readSongView(): SongView {
	try {
		const v = globalThis.localStorage?.getItem(KEY);
		return isView(v) ? v : 'lyrics';
	} catch {
		return 'lyrics';
	}
}

export function writeSongView(v: SongView) {
	try {
		if (v === 'lyrics') globalThis.localStorage?.removeItem(KEY);
		else globalThis.localStorage?.setItem(KEY, v);
	} catch {
		// a per-device convenience only
	}
}

/** alphaTex with lyrics of its own (\lyrics): the tab can show or hide them. */
export const texHasLyrics = (tex: string | undefined) => !!tex && /\\lyrics\b/.test(tex);
