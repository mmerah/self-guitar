import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSongs } from '../../src/lib/content/load';
import {
	HOWTO_MAX_WORDS,
	howToWords,
	loadLearn,
	scoreChordLabels
} from '../../src/lib/content/learn';
import { getChord } from '../../src/lib/chords';
import { parseStrum } from '../../src/lib/learn/strum';
import { checkAlphaTex, strumMismatches } from '../../src/lib/content/alphatex';
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
		attribution: 'a',
		play: 'melody'
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

describe('exercise "what to play" in the content index', () => {
	const { index, errors } = loadLearn(contentDir);

	it('every exercise has howTo steps; chords and strum patterns are valid', () => {
		expect(errors).toEqual([]);
		expect(index.exercises.length).toBeGreaterThan(0);
		for (const e of index.exercises) {
			expect(e.howTo.length, e.id).toBeGreaterThanOrEqual(1);
			expect(e.howTo.length, e.id).toBeLessThanOrEqual(3);
			for (const c of e.chords ?? []) expect(getChord(c), `${e.id}: ${c}`).toBeDefined();
			if (e.strum) expect(parseStrum(e.strum), e.id).toHaveProperty('slots');
		}
		expect(index.exercises.some((e) => e.chords?.length)).toBe(true);
		expect(index.exercises.some((e) => e.strum)).toBe(true);
	});

	it("howTo stays short, lists the score's chords, and strummed bars follow the strum row", () => {
		for (const e of index.exercises) {
			expect(howToWords(e.howTo), e.id).toBeLessThanOrEqual(HOWTO_MAX_WORDS);
			if (e.chords)
				for (const c of scoreChordLabels(e.tex)) expect(e.chords, `${e.id}: ${c}`).toContain(c);
			if (e.strum) expect(strumMismatches(e.tex, e.strum.split(/\s+/)), e.id).toEqual([]);
		}
		expect(howToWords(['Fret 1 = index, 2 + 3.'])).toBe(5);
		// A held half note where the row shows strums on 3 and 4.
		const held = '\\tempo 60\n\\ts (4 4)\n:4 0.6 0.6 :2 0.6';
		expect(strumMismatches(held, 'D - D - D - D -'.split(' '))).toEqual([1]);
		expect(strumMismatches(':4 0.6 0.6 0.6 0.6', 'D - D - D - D -'.split(' '))).toEqual([]);
	});

	it('the compiled index keeps howTo, chords and strum', () => {
		const ex = index.exercises.find((e) => e.chords && e.strum)!;
		const json = JSON.parse(JSON.stringify(index)) as typeof index;
		const back = json.exercises.find((e) => e.id === ex.id)!;
		expect(back.howTo).toEqual(ex.howTo);
		expect(back.chords).toEqual(ex.chords);
		expect(back.strum).toEqual(ex.strum);
	});

	it('rejects unknown chords and bad strum patterns', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-ex-'));
		const levels = [
			{
				id: 0,
				title: 'L0',
				goal: 'g',
				units: [{ id: 'u0', title: 'U', skills: [{ id: 's1', name: 'S', description: 'd' }] }]
			}
		];
		fs.mkdirSync(path.join(dir, 'exercises/x'), { recursive: true });
		fs.writeFileSync(
			path.join(dir, 'exercises/x/meta.json'),
			JSON.stringify({
				id: 'x',
				title: 'Bad what-to-play',
				skills: ['s1'],
				howTo: ['Play it.'],
				chords: ['G', 'Q#13'],
				strum: 'D X D',
				startBpm: 60,
				targetBpm: 80
			})
		);
		fs.writeFileSync(path.join(dir, 'exercises/x/score.atex'), '\\tempo 80\n:4 0.1 0.1 0.1 0.1');
		const { errors } = loadLearn(dir, levels);
		const all = errors.join('\n');
		expect(all).toMatch(/exercises\/x\/meta.json: chords: unknown chord "Q#13"/);
		expect(all).toMatch(/exercises\/x\/meta.json: strum: strum slot "X"/);
	});
});
