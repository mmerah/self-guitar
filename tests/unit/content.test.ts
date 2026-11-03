import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSongs } from '../../src/lib/content/load';
import { checkAlphaTex } from '../../src/lib/content/alphatex';
import { songMetaSchema } from '../../src/lib/content/schema';

const contentDir = path.resolve(__dirname, '../../content');

describe('content index', () => {
	const { songs, errors } = loadSongs(contentDir);

	it('loads every song without schema errors', () => {
		expect(errors).toEqual([]);
		expect(songs.length).toBeGreaterThanOrEqual(10);
		expect(new Set(songs.map((s) => s.id)).size).toBe(songs.length);
	});

	it('covers beginner levels and records licensing', () => {
		const levels = new Set(songs.map((s) => s.level));
		for (const level of [0, 1, 2, 3, 4]) expect(levels).toContain(level);
		for (const song of songs) {
			expect(song.license).not.toBe('');
			expect(song.attribution).not.toBe('');
		}
	});

	it('names sections with words: a single letter reads like a chord symbol', () => {
		for (const song of songs) {
			for (const [, name] of song.tex.matchAll(/\\section\s+"([^"]*)"/g))
				expect(name, song.id).not.toMatch(/^[A-G][#b]?m?\d*$/);
		}
	});

	it.each(songs.map((s) => [s.id, s.tex]))('%s parses cleanly with alphaTab', (_id, tex) => {
		expect(checkAlphaTex(tex)).toEqual([]);
	});
});

describe('checkAlphaTex', () => {
	it('reports syntax errors', () => {
		const problems = checkAlphaTex('\\title "x"\n:4 0.1 0.2 {{ |');
		expect(problems.length).toBeGreaterThan(0);
	});

	it('reports bars that do not add up to the time signature', () => {
		const problems = checkAlphaTex('\\ts (4 4)\n:4 0.1 0.1 0.1 | 0.1 0.1 0.1 0.1');
		expect(problems).toEqual([expect.stringContaining('bar 1 voice 1')]);
	});

	it('accepts a short pickup bar', () => {
		expect(checkAlphaTex('\\ts (3 4) \\ac\n:4 0.1 | 0.1 0.1 0.1')).toEqual([]);
	});
});

describe('song meta schema', () => {
	const valid = {
		id: 'x-y',
		title: 'X',
		composer: 'C',
		arranger: 'A',
		level: 1,
		style: 'folk',
		key: 'C major',
		source: 's',
		license: 'l',
		attribution: 'a'
	};

	it('accepts a valid meta', () => {
		expect(songMetaSchema.safeParse(valid).success).toBe(true);
	});

	it.each([
		['level out of range', { ...valid, level: 10 }],
		['unknown style', { ...valid, style: 'metal' }],
		['bad id', { ...valid, id: 'Not Kebab' }],
		['unknown field', { ...valid, extra: 1 }],
		['missing license', { ...valid, license: undefined }]
	])('rejects %s', (_name, meta) => {
		expect(songMetaSchema.safeParse(meta).success).toBe(false);
	});
});
