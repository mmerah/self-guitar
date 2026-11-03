import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkAlphaTex, scoreShape } from '../../src/lib/content/alphatex';
import { loadSongs } from '../../src/lib/content/load';
import { accompaniment, noteValues, strumsOf } from '../../src/lib/sheet/accompany';
import {
	parseChordPro,
	parseLyric,
	pickupSlots,
	SLOTS,
	syllables
} from '../../src/lib/sheet/chordpro';
import { wrapUnits } from '../../src/lib/sheet/wrap';
import { resolveChord, transposeChord } from '../../src/lib/sheet/chords';

const head = (extra = '') => `{title: Test}
{key: G}
{tempo: 90}
{time: 4/4}
{x_strum: D - D U - U D U}
${extra}
{start_of_grid label="Verse"}
| G . . . | C . G . |
| D . . . | G . . . |
{end_of_grid}
`;
const verse = `{start_of_verse label="Verse 1"}
[G]One line of [C]words [G]here,
[D]Two lines of [G]words.
{end_of_verse}
`;

describe('ChordPro parser', () => {
	it('splits lyric lines into chord segments', () => {
		expect(parseLyric('Re[Am]member me to [G]one')).toEqual([
			{ chord: null, text: 'Re' },
			{ chord: 'Am', text: 'member me to ' },
			{ chord: 'G', text: 'one' }
		]);
		expect(parseLyric('[G]')).toEqual([{ chord: 'G', text: '' }]);
	});

	it('parses the header, sections, grid bars, recalls and the end chord', () => {
		const src =
			head('{capo: 2}') +
			verse +
			`{start_of_chorus}\n{x_strum: D - D - D - D -}\n[G]Chorus [C]line [G]one,\n[D]Chorus line [G]two.\n{end_of_chorus}\n{start_of_grid label="Chorus"}\n| G . . . | C . G . |\n| D . . . | G . . . |\n{end_of_grid}\n{chorus}\n{comment: Slower at the end}\n{x_end: G}\n`;
		const { sheet, errors } = parseChordPro(src);
		expect(errors).toEqual([]);
		expect(sheet).toMatchObject({ title: 'Test', key: 'G', capo: 2, tempo: 90, time: '4/4' });
		expect(
			sheet!.blocks.map((b) =>
				b.type === 'comment' ? 'comment' : `${b.type}${b.recall ? '*' : ''}`
			)
		).toEqual(['verse', 'chorus', 'chorus*', 'comment']);
		expect(sheet!.chords).toEqual(['G', 'C', 'D']);
		// 3 blocks of 4 bars + the end bar; every bar knows its line and the chord in each cell.
		expect(sheet!.bars).toHaveLength(13);
		expect(sheet!.bars[1]).toEqual({ b: 0, l: 0, c: ['C', 'C', 'G', 'G'] });
		expect(sheet!.bars[12]).toEqual({ b: -1, l: -1, c: ['G'] });
		const chorus = sheet!.blocks[1];
		expect(chorus.type === 'chorus' && chorus.strum).toBe('D - D - D - D -');
	});

	it('accepts chord aliases and slash chords, by their canonical names', () => {
		expect(resolveChord('Amin')?.name).toBe('Am');
		expect(resolveChord('FM7')?.name).toBe('Fmaj7');
		expect(resolveChord('D/F#')?.name).toBe('D/F#');
		expect(resolveChord('A#m')?.name).toBe('Bbm');
		expect(resolveChord('H7')).toBeNull();
		const { sheet, errors } = parseChordPro(
			head().replace('| D . . . |', '| D/F# . . . |') + verse.replace('[D]Two', '[D/F#]Two')
		);
		expect(errors).toEqual([]);
		expect(sheet!.chords).toContain('D/F#');
	});

	it('rejects what it cannot play: unknown chords, mismatched grids, bad strums, unknown directives', () => {
		const bad = (src: string) => parseChordPro(src).errors.join('\n');
		expect(bad(head() + verse.replace('[C]words', '[Cx9]words'))).toMatch(/unknown chord "Cx9"/);
		expect(bad(head() + verse.replace('[C]words [G]here', 'words here'))).toMatch(
			/lyric chords \[G\] do not match grid chords \[G C G\]/
		);
		expect(bad(head().replace('D - D U - U D U', 'D - D U') + verse)).toMatch(
			/4 slots; 4\/4 needs 8/
		);
		expect(bad(head('{artist_url: x}') + verse)).toMatch(/unsupported directive \{artist_url\}/);
		expect(bad(head('{capo: 9}') + verse)).toMatch(/capo/);
		expect(bad(head() + verse + '{chorus}\n')).toMatch(/\{chorus\} before any chorus/);
		expect(bad(head() + verse.replace('[D]Two lines of [G]words.\n', ''))).toMatch(
			/1 lyric lines but its grid has 2/
		);
	});

	it('transposes chord names (with the library spelling) and keeps the suffix', () => {
		expect(transposeChord('Am', 2)).toBe('Bm');
		expect(transposeChord('D/F#', 1)).toBe('Eb/G');
		expect(transposeChord('Bb7', 2)).toBe('C7');
		expect(transposeChord('G', -12)).toBe('G');
		expect(transposeChord('Em', -1)).toBe('Ebm');
	});
});

describe('accompaniment', () => {
	it('splits rings into note values', () => {
		expect(noteValues(8)).toEqual([':1']);
		expect(noteValues(5)).toEqual([':2', ':8']);
		expect(noteValues(3)).toEqual([':4{d}']);
	});

	it('generates bars that add up, one per sheet bar, for every song and every transposition', () => {
		const { songs, errors } = loadSongs(path.resolve(__dirname, '../../content'));
		expect(errors).toEqual([]);
		const sheets = songs.filter((s) => s.sheet);
		expect(sheets.length).toBeGreaterThanOrEqual(5);
		for (const song of sheets) {
			for (const t of [-5, -2, 0, 1, 3, 6]) {
				const tex = accompaniment(song.sheet!, t);
				expect(checkAlphaTex(tex), `${song.id} ${t}`).toEqual([]);
				expect(scoreShape(tex).bars, song.id).toBe(song.sheet!.bars.length);
			}
		}
	});

	it('plays the strum: D = every voiced string, U = the top three, - rings on; capo on the staff', () => {
		const { sheet } = parseChordPro(head('{capo: 3}') + verse);
		const tex = accompaniment(sheet!);
		expect(tex).toContain('\\staff { tabs } \\capo 3');
		// Bar 1, G (320003): D (2 slots) D U (2 slots) U D U.
		const bar1 = tex.split('\n').find((l) => l.includes('ch "G"'))!;
		expect(bar1).toMatch(
			/^:4 \(3\.6 2\.5 0\.4 0\.3 0\.2 3\.1\)\{bd ch "G"\} :8 \(3\.6 2\.5 0\.4 0\.3 0\.2 3\.1\)\{bd\} :4 \(0\.3 0\.2 3\.1\)\{bu\}/
		);
		// Transposed up 2: G becomes A, named and fingered as A.
		expect(accompaniment(sheet!, 2)).toContain('ch "A"');
	});

	it('the shipped sheets are traditional texts (no 1960s Scarborough Fair lines)', () => {
		const src = fs.readFileSync(
			path.resolve(__dirname, '../../content/songs/scarborough-fair/song.cho'),
			'utf8'
		);
		expect(src).not.toMatch(/She once was a true love of mine/i);
		const tab = fs.readFileSync(
			path.resolve(__dirname, '../../content/songs/scarborough-fair/score.atex'),
			'utf8'
		);
		expect(tab).not.toMatch(/She once was a true love of mine/i);
	});
});

describe('accompaniment: chord changes on held slots', () => {
	it('strikes a chord that changes where the pattern holds (down on a beat, up off it)', () => {
		// "D - D U - U D U": slot 4 (beat 3) holds; a change to C there is struck down.
		expect(strumsOf('D - D U - U D U'.split(' '), ['G', 'C'], '4/4')).toEqual([
			{ chord: 'G', up: false, len: 2 },
			{ chord: 'G', up: false, len: 1 },
			{ chord: 'G', up: true, len: 1 },
			{ chord: 'C', up: false, len: 1 },
			{ chord: 'C', up: true, len: 1 },
			{ chord: 'C', up: false, len: 1 },
			{ chord: 'C', up: true, len: 1 }
		]);
		// Four cells: the change at slot 6 lands on a held slot, on the beat: struck down.
		expect(
			strumsOf('D - - - D - - -'.split(' '), ['G', 'G', 'G', 'D'], '4/4').map((s) => [
				s.chord,
				s.up,
				s.len
			])
		).toEqual([
			['G', false, 4],
			['G', false, 2],
			['D', false, 2]
		]);
		// 6/8 in two cells: the change on the second beat (slot 3) is a down strum.
		expect(strumsOf('D - - - - -'.split(' '), ['Am', 'E'], '6/8')[1]).toEqual({
			chord: 'E',
			up: false,
			len: 3
		});
		// Off the beat (eight cells of 4/4: slot 5 is an "&"): an up strum.
		const cells = ['G', 'G', 'G', 'G', 'G', 'C', 'C', 'C'];
		expect(strumsOf('D - D - D - D -'.split(' '), cells, '4/4')[3]).toEqual({
			chord: 'C',
			up: true,
			len: 1
		});
		// No change: the held slots ring on.
		expect(strumsOf('D - - - D - - -'.split(' '), ['G', 'G'], '4/4')).toHaveLength(2);
	});

	it('every sheet: each chord change sounds where it lights up', () => {
		const { songs } = loadSongs(path.resolve('content'));
		for (const song of songs.filter((s) => s.sheet)) {
			const sheet = song.sheet!;
			for (const bar of sheet.bars) {
				if (bar.p || bar.b < 0) continue;
				const block = sheet.blocks[bar.b];
				if (block.type === 'comment') continue;
				const slots = block.strum.split(' ').slice(0, SLOTS[sheet.time]);
				const strums = strumsOf(slots, bar.c, sheet.time);
				const per = slots.length / bar.c.length;
				let at = 0;
				const onsets = new Map(strums.map((s) => [((at += s.len), at - s.len), s.chord]));
				bar.c.forEach((c, k) => {
					if (k > 0 && c !== bar.c[k - 1]) expect(onsets.get(k * per), song.id).toBe(c);
				});
			}
		}
	});
});

describe('pickups', () => {
	const sheetWith = (firstLine: string, time = '4/4', strum = 'D - D U - U D U') =>
		parseChordPro(`{title: Test}
{key: G}
{tempo: 90}
{time: ${time}}
{x_strum: ${strum}}
{start_of_grid label="Verse"}
| G . . . | C . G . |
{end_of_grid}
{start_of_verse label="Verse 1"}
${firstLine}
{end_of_verse}
`);

	it('lyrics before the first chord become a pickup bar on the first line', () => {
		const { sheet, errors } = sheetWith('Oh, [G]one line of [C]words [G]here');
		expect(errors).toEqual([]);
		expect(sheet!.pickup).toBe(2);
		expect(sheet!.bars[0]).toEqual({ b: 0, l: 0, c: ['G'], p: 2 });
		expect(sheet!.bars).toHaveLength(3);
		const tex = accompaniment(sheet!);
		expect(tex).toMatch(/\\ts \(4 4\) \\ac/);
		expect(checkAlphaTex(tex)).toEqual([]);
		expect(scoreShape(tex)).toEqual({ bars: 3, pickup: true });
	});

	it('sizes the pickup from the syllables, always shorter than a bar', () => {
		expect(syllables('Oh, give me a')).toBe(4);
		expect(syllables('Danny')).toBe(2);
		expect(syllables('home')).toBe(1);
		const line = (lead: string) => parseLyric(`${lead}[G]word`);
		expect(pickupSlots(line('The '), '4/4')).toBe(2);
		expect(pickupSlots(line('Let me '), '3/4')).toBe(2);
		expect(pickupSlots(line('Oh, give me a '), '3/4')).toBe(4);
		expect(pickupSlots(line('Oh, when the saints go '), '3/4')).toBe(4);
		expect(pickupSlots(line('When '), '6/8')).toBe(1);
		// A first chord at the start, or a line without chords: no pickup.
		expect(pickupSlots(parseLyric('[G]Silent night'), '3/4')).toBe(0);
		expect(pickupSlots(parseLyric('no chords at all'), '4/4')).toBe(0);
	});

	it('a sheet that starts on its first chord has none', () => {
		const { sheet } = sheetWith('[G]One line of [C]words [G]here');
		expect(sheet!.pickup).toBe(0);
		expect(sheet!.bars.some((b) => b.p)).toBe(false);
		expect(accompaniment(sheet!)).not.toMatch(/\\ac/);
	});
});

describe('lyric wrapping', () => {
	it('keeps a word split by a chord whole, and each chord over its syllable', () => {
		const units = wrapUnits(parseLyric('Si[G]lent night, [D]ho-ly night'));
		expect(units.map((u) => u.map((s) => s.text).join(''))).toEqual([
			'Silent ',
			'night, ',
			'ho-ly ',
			'night'
		]);
		expect(units[0]).toEqual([
			{ chord: null, text: 'Si' },
			{ chord: 'G', text: 'lent ' }
		]);
		expect(units[2][0].chord).toBe('D');
		// A chord after the last word still gets a unit.
		expect(wrapUnits(parseLyric('end [C]')).at(-1)).toEqual([{ chord: 'C', text: '' }]);
	});
});
