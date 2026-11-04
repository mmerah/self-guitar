// M6 review fixes: 3-per-string wraps, triad fingers, slash chords, 6/8 strums, ::fretboard
// highlight / modes, the curriculum split for loading, the learner's level in the planner, and
// mastery that sticks once achieved.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { api } from './api-context';
import { base, index } from './planner-fixtures';
import { checkVoicing, chordSlug, parseChordName } from '../../src/lib/chords/model';
import { getChord } from '../../src/lib/chords';
import { fretboardInputSchema } from '../../src/lib/core/ear';
import { quizMaxFound, quizSpec } from '../../src/lib/fretboard/quiz';
import { tabNeck } from '../../src/lib/fretboard/tabNeck';
import { parseLesson } from '../../src/lib/learn/markdown';
import { learnIndexOf, lessonPayload } from '../../src/lib/learn/payload';
import {
	compoundBeat,
	parseStrum,
	scoreMeter,
	strumCount,
	strumMeter,
	strumSlotAt,
	strumSlotInBar
} from '../../src/lib/learn/strum';
import { altTuning, tuningNoteLabel } from '../../src/lib/learn/tuning';
import type { LearnContent, LessonState } from '../../src/lib/learn/types';
import { learnerLevel, planSession } from '../../src/lib/session/planner';
import { lessonPractice } from '../../src/lib/session/practice';
import {
	BOX_MAX_FRET,
	TRIAD_TYPES,
	boxCount,
	boxDots,
	overlay,
	parseFretboard,
	triadShapes
} from '../../src/lib/theory/fretboard';
import { ROOT_NAMES } from '../../src/lib/theory/notes';
import { SCALES, SCALE_IDS } from '../../src/lib/theory/scales';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'self-guitar-m6final-'));

const full = (
	JSON.parse(fs.readFileSync('generated/content.json', 'utf8')) as { learn: LearnContent }
).learn;

describe('scale boxes and 3-notes-per-string positions', () => {
	it('every root, scale and position keeps all its notes, rising string by string', () => {
		for (const root of ROOT_NAMES)
			for (const id of SCALE_IDS)
				for (let box = 1; box <= boxCount(id); box++) {
					const where = `${root} ${id} ${box}`;
					const dots = boxDots(root, id, box).filter((d) => !d.extra);
					const per = id === 'blues' ? 2 : SCALES[id].tokens.length <= 5 ? 2 : 3;
					expect(dots, where).toHaveLength(per * 6);
					for (const s of [1, 2, 3, 4, 5, 6])
						expect(
							dots.filter((d) => d.string === s),
							`${where} string ${s}`
						).toHaveLength(per);
					const frets = dots.map((d) => d.fret);
					expect(Math.min(...frets), where).toBeGreaterThanOrEqual(0);
					expect(Math.max(...frets), where).toBeLessThanOrEqual(BOX_MAX_FRET);
					// Low to high, no gaps: each note is the next scale note above the one before.
					const midis = [...dots].sort((a, b) => b.string - a.string || a.fret - b.fret);
					for (let i = 1; i < midis.length; i++)
						expect(midis[i].midi, where).toBeGreaterThan(midis[i - 1].midi);
					// The overlay shows every one of them.
					const v = overlay({ mode: 'scale', root, scale: id, box, labels: 'intervals' });
					const shown = v.dots.filter((d) => d.fret >= v.window[0] && d.fret <= v.window[1]);
					expect(shown.length, where).toBe(v.dots.length);
				}
	});
});

describe('triads on string sets', () => {
	it('never give one finger two notes (sus2/sus4 on 3-5 and 4-6 included)', () => {
		for (const root of ROOT_NAMES)
			for (const type of TRIAD_TYPES)
				for (const set of [
					[1, 2, 3],
					[2, 3, 4],
					[3, 4, 5],
					[4, 5, 6]
				])
					for (const shape of triadShapes(root, type, set)) {
						const fingers = shape.dots.flatMap((d) => (d.finger ? [d.finger] : []));
						expect(new Set(fingers).size, `${root} ${type} ${set}`).toBe(fingers.length);
						// Higher frets never take lower fingers.
						const byFret = shape.dots.filter((d) => d.finger).sort((a, b) => a.fret - b.fret);
						for (let i = 1; i < byFret.length; i++)
							if (byFret[i].fret > byFret[i - 1].fret)
								expect(byFret[i].finger!).toBeGreaterThan(byFret[i - 1].finger!);
					}
	});
});

describe('slash chords', () => {
	const IDS = ['G/F#', 'G/B', 'C/B', 'C/G', 'D/C', 'D/F#', 'Am/G', 'F/C'];
	it('parse, with the bass in canonical spelling', () => {
		expect(parseChordName('G/F#')).toEqual({ root: 'G', quality: '', bass: 'F#' });
		expect(parseChordName('Am/G')).toEqual({ root: 'A', quality: 'm', bass: 'G' });
		expect(parseChordName('G/Gb')).toEqual({ root: 'G', quality: '', bass: 'F#' });
		expect(parseChordName('C/C')).toEqual({ root: 'C', quality: '' });
		// A quality with a slash is still a quality.
		expect(parseChordName('C6/9')).toEqual({ root: 'C', quality: '6/9' });
		expect(parseChordName('G/H')).toBeNull();
		expect(chordSlug('G', '', 'F#')).toBe('g-over-f-sharp');
	});
	it('are in the library with voicings whose lowest note is the bass', () => {
		for (const id of IDS) {
			const c = getChord(id);
			expect(c, id).toBeDefined();
			expect(c!.id).toBe(id);
			expect(getChord(c!.slug)?.id).toBe(id);
			for (const v of c!.voicings) expect(checkVoicing(c!, v), id).toEqual([]);
		}
		expect(getChord('G/F#')!.voicings[0].frets).toEqual([2, null, 0, 0, 0, 3]);
		expect(getChord('D/F#')!.voicings[0].frets[0]).toBe(2);
		expect(getChord('G')!.bass).toBeUndefined();
	});
	it('the slash-chords lesson and its exercises use them', () => {
		const l = full.lessons.find((x) => x.id === 'slash-chords-and-bass-walks')!;
		expect(l.chords).toEqual(expect.arrayContaining(['G/F#', 'C/B', 'D/C', 'G/B']));
		const used = full.exercises
			.filter((e) => l.exercises!.includes(e.id))
			.flatMap((e) => e.chords ?? []);
		expect(used).toEqual(expect.arrayContaining(['G/F#', 'C/B', 'D/C', 'G/B']));
	});
});

describe('6/8 strums', () => {
	it('count 1–6 with the big beats on 1 and 4', () => {
		const p = parseStrum('D - U D - U', undefined, '6/8');
		expect(p).toEqual({ slots: 'D-UD-U'.split(''), sub: 8, ts: '6/8' });
		expect([0, 1, 2, 3, 4, 5].map((i) => strumCount(i, 6, 8, '6/8'))).toEqual(
			'1 2 3 4 5 6'.split(' ')
		);
		expect([0, 1, 2, 3, 4, 5].filter(compoundBeat)).toEqual([0, 3]);
		// Without ts the same six slots are a bar of 3/4.
		expect(strumCount(1, 6)).toBe('&');
		expect(strumMeter(6, 8, '6/8')).toEqual({ beats: 6, timeSignature: '6/8' });
		expect(strumSlotAt({ bar: 1, beat: 4, sub: 0 }, 12, 8, '6/8')).toBe(10);
		expect(parseStrum('D-DU DUDU', undefined, '6/8')).toHaveProperty('error');
		expect(parseStrum('D D U D', undefined, '6/8')).toHaveProperty('error');
	});
	it('map a 6/8 tab playhead onto the strum row', () => {
		const tex = '\\ts (6 8)\n:8 0.6 0.6 0.6 0.6 0.6 0.6';
		expect(scoreMeter(tex)).toEqual({ num: 6, den: 8, ts: '6/8' });
		const m = scoreMeter(tex);
		const at = (bar: number, frac: number) =>
			strumSlotInBar({ length: 6, sub: 8 }, m.num, bar, frac, m.den);
		expect([0, 0.17, 0.34, 0.5, 0.67, 0.84].map((f) => at(0, f))).toEqual([0, 1, 2, 3, 4, 5]);
		expect(at(3, 0.5)).toBe(3);
		// A 12-slot (two-bar) pattern: the second bar is slots 6–11.
		expect(strumSlotInBar({ length: 12, sub: 8 }, 6, 1, 0, 8)).toBe(6);
	});
	it('::strum takes ts="6/8"; the 6/8 lesson and exercise use it', () => {
		const { blocks, problems } = parseLesson('::strum{pattern="D D U D D U" bpm=120 ts="6/8"}');
		expect(problems).toEqual([]);
		expect(blocks[0]).toMatchObject({ t: 'strum', ts: '6/8' });
		expect(
			parseLesson('::strum{pattern="D D U D D U" bpm=120 ts="9/8"}').problems.map((p) => p.message)
		).toEqual([expect.stringMatching(/ts must be "6\/8"/)]);
		const l = full.lessons.find((x) => x.id === 'six-eight-ballad-strumming')!;
		const strums = JSON.stringify(l.blocks).match(/"t":"strum"[^}]*/g) ?? [];
		expect(strums.length).toBeGreaterThan(0);
		for (const s of strums) expect(s).toContain('"ts":"6/8"');
		const ex = full.exercises.find((e) => e.id === 'six-eight-strum-g-em-c-d')!;
		expect(scoreMeter(ex.tex).ts).toBe('6/8');
		expect(parseStrum(ex.strum!, undefined, '6/8')).toMatchObject({ ts: '6/8' });
	});
});

describe('::fretboard highlight= and modes="all"', () => {
	it('highlight marks the degrees', () => {
		const problems: string[] = [];
		const spec = parseFretboard({ scale: 'lydian', root: 'C', highlight: '#4' }, problems);
		expect(problems).toEqual([]);
		const accents = overlay(spec!).dots.filter((d) => d.accent);
		expect(accents.length).toBeGreaterThan(0);
		expect(new Set(accents.map((d) => d.name))).toEqual(new Set(['F#']));
		const both = parseFretboard({ modes: 'all', root: 'C', highlight: '#4,b2' }, problems)!;
		expect(both.highlight).toEqual(['#4', 'b2']);
		const bad: string[] = [];
		parseFretboard({ scale: 'major', root: 'C', highlight: 'b3' }, bad);
		expect(bad.join()).toMatch(/not in this scale/);
	});
	it('modes="all" shows one mode at a time with its colour note', () => {
		const problems: string[] = [];
		const spec = parseFretboard({ modes: 'all', root: 'C' }, problems)!;
		expect(problems).toEqual([]);
		expect(spec).toMatchObject({ modes: 'all', scale: 'ionian' });
		expect(overlay(spec).dots.some((d) => d.accent)).toBe(false);
		const dorian = overlay({ ...spec, scale: 'dorian' });
		expect(new Set(dorian.dots.filter((d) => d.accent).map((d) => d.token))).toEqual(
			new Set(['6'])
		);
		expect(dorian.title).toMatch(/dorian · 6/i);
		const l = full.lessons.find((x) => x.id === 'the-seven-modes')!;
		expect(JSON.stringify(l.blocks)).toContain('"modes":"all"');
	});
});

describe('the curriculum split for loading', () => {
	const idx = JSON.parse(fs.readFileSync('generated/content-index.json', 'utf8'));
	it('the index has no lesson bodies or scores, but what lists and the planner need', () => {
		expect(fs.statSync('generated/content-index.json').size).toBeLessThan(400_000);
		for (const l of idx.learn.lessons) {
			expect(l).not.toHaveProperty('blocks');
			expect(l).toHaveProperty('exercises');
			expect(l).toHaveProperty('widget');
		}
		for (const e of idx.learn.exercises) expect(e).not.toHaveProperty('tex');
		expect(learnIndexOf(full)).toEqual(idx.learn);
	});
	it('each lesson and exercise has its own file with its body and scores', () => {
		for (const l of full.lessons) {
			const p = JSON.parse(fs.readFileSync(`generated/learn/lesson-${l.id}.json`, 'utf8'));
			expect(p).toEqual(lessonPayload(full, l.id));
			expect(p.lesson.blocks.length).toBeGreaterThan(0);
			for (const id of l.exercises ?? [])
				expect(p.exercises.find((e: { id: string }) => e.id === id)?.tex).toBeTruthy();
		}
		for (const e of full.exercises)
			expect(JSON.parse(fs.readFileSync(`generated/learn/exercise-${e.id}.json`, 'utf8'))).toEqual(
				e
			);
	});
	it('the compiled widget is the one the body gives', () => {
		for (const l of full.lessons) expect(l.widget, l.id).toEqual(lessonPractice(l).widget);
	});
	it('serves lessons and exercises by id', async () => {
		const lesson = await (
			await api('/api/learn/lessons/[id]').GET({ params: { id: full.lessons[3].id } })
		).json();
		expect(lesson.lesson.blocks).toEqual(full.lessons[3].blocks);
		const ex = await (
			await api('/api/learn/exercises/[id]').GET({ params: { id: full.exercises[0].id } })
		).json();
		expect(ex.tex).toBe(full.exercises[0].tex);
		await expect(
			api('/api/learn/lessons/[id]').GET({ params: { id: 'nope' } })
		).rejects.toMatchObject({ status: 404 });
		// Song credits are their own file: the song list carries none.
		const credits = await (await api('/api/credits').GET()).json();
		expect(credits.length).toBe(idx.songs.length);
		expect(credits[0]).toHaveProperty('license');
		expect(idx.songs[0]).not.toHaveProperty('attribution');
		expect(JSON.parse(fs.readFileSync('generated/song-credits.json', 'utf8'))).toEqual(credits);
		const listed = await (await api('/api/learn').GET()).json();
		expect(listed.lessons[0]).not.toHaveProperty('blocks');
	});
});

describe("the planner's level", () => {
	const states = (ids: string[], st: LessonState) =>
		Object.fromEntries(ids.map((id) => [id, st])) as Record<string, LessonState>;
	const at = (lv: number) => index.lessons.filter((l) => l.level === lv).map((l) => l.id);
	it('comes from mastered lessons, not opened ones', () => {
		const opened = states([...at(5), ...at(6)], 'started');
		const l0 = states(at(0), 'mastered');
		expect(learnerLevel(index, (id) => ({ ...opened, ...l0 })[id] ?? 'new')).toBe(1);
		expect(learnerLevel(index, () => 'new')).toBe(0);
		const l3 = { ...l0, ...states([...at(1), ...at(2), ...at(3)], 'mastered') };
		expect(learnerLevel(index, (id) => l3[id] ?? 'new')).toBe(4);
	});
	it('a Level-1 learner who opened Level 5 lessons gets no Level 5 warm-up or song', () => {
		const bwv = index.lessons.find((l) => l.level === 5)!;
		const lessonStates = {
			...states(at(0), 'mastered'),
			...states(at(1).slice(0, 3), 'mastered'),
			...states(at(5), 'started')
		};
		for (const minutes of [10, 15, 20, 30]) {
			const plan = planSession(base({ minutes, lessonStates, next: bwv.id }));
			for (const b of plan.blocks) {
				const t = b.target;
				if (t.type === 'warmup')
					expect(index.warmups.find((w) => w.id === t.id)!.level).toBeLessThanOrEqual(1);
				if (t.type === 'song') expect(t.id).not.toMatch(/bwv|999/i);
			}
		}
	});
	it('a new-skill block on a fretboard or ear lesson practises its own quiz', () => {
		for (const l of full.lessons) {
			const m = l.mastery;
			if (m?.type === 'fretboard') expect(l.widget).toMatchObject({ t: 'fretquiz', quiz: m.quiz });
			if (m?.type === 'ear') expect(l.widget).toMatchObject({ t: 'ear', kind: m.kind });
		}
	});
});

describe('mastery sticks', () => {
	const post = (body: unknown) => ({
		request: new Request('http://x', { method: 'POST', body: JSON.stringify(body) })
	});
	let ear: ReturnType<typeof api>;
	let fb: ReturnType<typeof api>;
	beforeAll(() => {
		ear = api('/api/ear');
		fb = api('/api/fretboard');
	});
	const progress = async () => (await api('/api/learn/progress').GET()).json();

	it('an ear check passed once stays mastered after wrong answers', async () => {
		const l = full.lessons.find((x) => x.mastery?.type === 'ear')!;
		const m = l.mastery as { kind: string; set: string[]; min: number };
		for (let i = 0; i < m.min; i++) {
			const item = m.set[i % m.set.length];
			await ear.POST(post({ kind: m.kind, item, answer: item }));
		}
		expect((await progress()).lessons[l.id].state).toBe('mastered');
		for (let i = 0; i < m.min; i++) {
			const item = m.set[i % m.set.length];
			await ear.POST(post({ kind: m.kind, item, answer: m.set[(i + 1) % m.set.length] }));
		}
		const p = await progress();
		expect(p.lessons[l.id].state).toBe('mastered');
		expect(p.lessons[l.id].mastery.done).toBe(true);
	});
	it('a fretboard check passed once stays mastered', async () => {
		const l = full.lessons.find((x) => x.mastery?.type === 'fretboard')!;
		const m = l.mastery as { quiz: string; target: number };
		await fb.POST(post({ quiz: m.quiz, found: 7, wrong: 0, ms: m.target * 900 }));
		expect((await progress()).lessons[l.id].state).toBe('mastered');
		await fb.POST(post({ quiz: m.quiz, found: 7, wrong: 5, ms: m.target * 3000 }));
		expect((await progress()).lessons[l.id].state).toBe('mastered');
	});
	it('a round cannot find more notes than the quiz has', async () => {
		expect(quizMaxFound(quizSpec('string-6'))).toBe(7);
		expect(quizMaxFound(quizSpec('note-C'))).toBe(6);
		expect(quizMaxFound(quizSpec('all'))).toBe(18);
		expect(
			fretboardInputSchema.safeParse({ quiz: 'string-6', found: 8, wrong: 0, ms: 9000 }).success
		).toBe(false);
		await expect(
			fb.POST(post({ quiz: 'note-C', found: 7, wrong: 0, ms: 9000 }))
		).rejects.toMatchObject({ status: 400 });
	});
});

describe('tuning and tab helpers', () => {
	it('spells open D with F♯', () => {
		const t = altTuning('\\tuning (D4 A3 F#3 D3 A2 D2)\n:4 0.6');
		expect(t?.notes.map(tuningNoteLabel)).toContain('F♯');
		expect(tuningNoteLabel('Bb2')).toBe('B♭');
	});
	it('the neck of a single-note tab, fingered in one position', () => {
		const neck = tabNeck('\\tempo 100\n\\ts (4 4)\n:8 5.6 8.6 5.5 7.5 5.4 7.4 5.3 7.3')!;
		expect(neck.dots).toHaveLength(8);
		expect(neck.fingered).toBe(true);
		expect(neck.dots.find((d) => d.string === 6 && d.fret === 8)?.finger).toBe(4);
		expect(neck.window).toEqual([4, 9]);
		expect(tabNeck(':4 (0.1 1.2 0.3)')).toBeNull();
		expect(tabNeck('\\tuning (D4 A3 F#3 D3 A2 D2)\n:4 0.6 2.6 4.6')).toBeNull();
	});
});
