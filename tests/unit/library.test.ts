import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SongSummary } from '../../src/lib/content/schema';
import {
	byLevelGroups,
	canPlay,
	chordTerms,
	filterSongs,
	myLevel,
	NO_FILTER,
	taughtChords
} from '../../src/lib/library';
import type { LearnIndex, LearnProgress } from '../../src/lib/learn/types';

const { songs, learn } = JSON.parse(fs.readFileSync('generated/content-index.json', 'utf8')) as {
	songs: SongSummary[];
	learn: LearnIndex;
};
const none = new Map();
const progress = (done: string[], next: LearnProgress['next'] = null): LearnProgress => ({
	lessons: Object.fromEntries(done.map((id) => [id, { state: 'completed', mastery: null }])),
	skills: {},
	exercises: {},
	masteredLevels: [],
	next
});

describe('Library: songs I can play', () => {
	it('keeps the chord sheets whose every chord is known (tabs are not chords to know)', () => {
		const known = new Set(['G', 'C', 'D']);
		const out = filterSongs(songs, { ...NO_FILTER, known }, none);
		expect(out.length).toBeGreaterThan(0);
		for (const s of out) {
			expect(s.kind).toBe('sheet');
			for (const c of s.chords!) expect(['G', 'C', 'D', 'D/F#'], `${s.id}: ${c}`).toContain(c);
		}
		// Every sheet with only G, C and D is there.
		const want = songs.filter(
			(s) => s.kind === 'sheet' && s.chords!.every((c) => ['G', 'C', 'D'].includes(c))
		);
		for (const s of want) expect(out.map((x) => x.id)).toContain(s.id);
		expect(
			canPlay(
				songs.find((s) => s.kind === 'tab')!,
				known
			)
		).toBe(false);
	});

	it('defaults to the chords the completed lessons taught', () => {
		expect(taughtChords(learn, progress([]))).toEqual([]);
		const all = taughtChords(learn, progress(learn.lessons.map((l) => l.id)));
		for (const c of ['G', 'C', 'D', 'Em', 'Am']) expect(all).toContain(c);
		// Only the lessons done count.
		const firstChordLesson = learn.lessons.find((l) =>
			l.blocks.some((b) => b.t === 'chord' || b.t === 'chords')
		)!;
		const some = taughtChords(learn, progress([firstChordLesson.id]));
		expect(some.length).toBeGreaterThan(0);
		expect(some.length).toBeLessThan(all.length);
	});

	it('the reader level is the next lesson’s, the near filter covers it ±1', () => {
		const lv = myLevel(learn, progress([], { id: 'x', title: 'x', level: 2 }));
		expect(lv).toBe(2);
		const out = filterSongs(songs, { ...NO_FILTER, level: 'near', myLevel: 2 }, none);
		expect(new Set(out.map((s) => s.level))).toEqual(
			new Set(songs.filter((s) => s.level >= 1 && s.level <= 3).map((s) => s.level))
		);
		expect(out.length).toBe(songs.filter((s) => s.level >= 1 && s.level <= 3).length);
	});
});

describe('Library: search', () => {
	it('several chords find the songs that use all of them', () => {
		expect(chordTerms('G C D')).toEqual(['G', 'C', 'D']);
		expect(chordTerms('g, em')).toEqual(['G', 'Em']);
		expect(chordTerms('Amazing grace')).toBeNull();
		const out = filterSongs(songs, { ...NO_FILTER, query: 'G C D7' }, none);
		expect(out.length).toBeGreaterThan(0);
		for (const s of out) for (const c of ['G', 'C', 'D7']) expect(s.chords, `${s.id}`).toContain(c);
		const two = filterSongs(songs, { ...NO_FILTER, query: 'Am E' }, none);
		for (const s of two) expect(s.chords).toEqual(expect.arrayContaining(['Am', 'E']));
		// A title still matches as text.
		expect(filterSongs(songs, { ...NO_FILTER, query: 'amazing' }, none)[0].id).toBe(
			'amazing-grace'
		);
	});

	it('groups the level sort into runs of one level', () => {
		const groups = byLevelGroups(filterSongs(songs, NO_FILTER, none));
		expect(groups.map((g) => g.level)).toEqual([...new Set(songs.map((s) => s.level))].sort());
		expect(groups.reduce((a, g) => a + g.songs.length, 0)).toBe(songs.length);
	});
});
