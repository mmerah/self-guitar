// M7.1: the song view switch (Lyrics | Tab | Both) and the accompaniment read as a tab.
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSongs } from '../../src/lib/content/load';
import { accompaniment } from '../../src/lib/sheet/accompany';
import { parseChordPro } from '../../src/lib/sheet/chordpro';
import { readSongView, texHasLyrics, writeSongView } from '../../src/lib/sheet/songView';

describe('song view preference', () => {
	const store = new Map<string, string>();
	const fake = {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, v),
		removeItem: (k: string) => void store.delete(k)
	};
	afterEach(() => {
		store.clear();
		delete (globalThis as { localStorage?: unknown }).localStorage;
	});

	it('defaults to lyrics, remembers tab / both globally, ignores junk', () => {
		expect(readSongView()).toBe('lyrics'); // no storage at all
		(globalThis as { localStorage?: unknown }).localStorage = fake;
		expect(readSongView()).toBe('lyrics');
		writeSongView('tab');
		expect(store.get('sg:song-view')).toBe('tab');
		expect(readSongView()).toBe('tab');
		writeSongView('both');
		expect(readSongView()).toBe('both');
		writeSongView('lyrics');
		expect(store.has('sg:song-view')).toBe(false);
		store.set('sg:song-view', 'karaoke');
		expect(readSongView()).toBe('lyrics');
	});

	it('survives a storage that throws', () => {
		(globalThis as { localStorage?: unknown }).localStorage = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			},
			removeItem: () => {}
		};
		expect(readSongView()).toBe('lyrics');
		expect(() => writeSongView('tab')).not.toThrow();
	});

	it('tells scores with lyrics of their own', () => {
		expect(texHasLyrics('\\track "G"\n\\lyrics "A-ma-zing"\n:4 0.3')).toBe(true);
		expect(texHasLyrics(':4 0.3{ch "G"}')).toBe(false);
		expect(texHasLyrics(undefined)).toBe(false);
	});
});

describe('the accompaniment as a tab', () => {
	it('names the chord above every bar, and each change inside a bar', () => {
		const parsed = parseChordPro(`{title: T}
{key: G}
{tempo: 90}
{time: 4/4}
{x_strum: D - D U - U D U}
{start_of_grid label="Verse"}
| G . . . | G . C . |
| G . . . | G . . . |
{end_of_grid}
{start_of_verse label="Verse 1"}
[G]One line of [C]words,
[G]two lines of words.
{end_of_verse}
`);
		expect(parsed.errors).toEqual([]);
		const tex = accompaniment(parsed.sheet!);
		const bars = tex
			.split('\n')
			.filter((l) => l.startsWith(':'))
			.flatMap((l) => l.split(' |'))
			.filter((b) => b.trim());
		expect(bars.length).toBeGreaterThan(1);
		for (const b of bars) expect(b).toMatch(/ch "/);
	});

	it('every chord sheet in the library: each strummed bar carries a chord name', () => {
		const { songs } = loadSongs(path.resolve('content'));
		expect(songs.filter((s) => s.sheet).length).toBeGreaterThan(50);
		for (const song of songs) {
			if (!song.sheet) continue;
			const bars = accompaniment(song.sheet)
				.split('\n')
				.filter((l) => !l.startsWith('\\') && !l.startsWith('//'))
				.join(' ')
				.split('|')
				.filter((b) => /\d\.\d/.test(b));
			for (const b of bars) expect(b, song.id).toMatch(/ch "/);
		}
	});
});
