// M6: the ::fretboard / ::ear / ::song directives, the ear and fretboard mastery checks, the
// planner's drills and the /api/ear and /api/fretboard endpoints.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseLesson } from '../../src/lib/learn/markdown';
import { earProgress, masteryProgress, type Snapshot } from '../../src/lib/learn/evaluate';
import { drillOf, planSession } from '../../src/lib/session/planner';
import { api } from './api-context';
import { base, index } from './planner-fixtures';
import type { Lesson } from '../../src/lib/learn/types';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'self-guitar-m6-'));

const parse = (line: string) => parseLesson(line);
const msgs = (line: string) =>
	parse(line)
		.problems.map((p) => p.message)
		.join(' | ');

describe('new directives', () => {
	it('::fretboard overlays and the quiz', () => {
		const { blocks, problems } = parse(
			'::fretboard[Box 1]{scale="minor-pentatonic" root="A" box="1" labels="intervals" frets="5-8"}'
		);
		expect(problems).toEqual([]);
		expect(blocks[0]).toMatchObject({
			t: 'fretboard',
			label: 'Box 1',
			spec: { mode: 'scale', scale: 'minor-pentatonic', root: 'A', box: 1, frets: [5, 8] }
		});
		for (const ok of [
			'::fretboard{chord="maj7" root="C" frets="0-5"}',
			'::fretboard{caged="E" root="G" labels="fingers"}',
			'::fretboard{triads="minor" root="A" strings="2-4"}',
			'::fretboard{note="C"}',
			'::fretboard{notes="naturals" strings="6" frets="0-12"}'
		])
			expect(msgs(ok)).toBe('');
		expect(parse('::fretboard{quiz="string-6" target=30}').blocks[0]).toEqual({
			t: 'fretquiz',
			quiz: 'string-6',
			target: 30
		});
		expect(msgs('::fretboard{quiz="string-9"}')).toMatch(/unknown quiz/);
		expect(msgs('::fretboard{scale="blues"}')).toMatch(/needs root=/);
	});
	it('::ear', () => {
		expect(parse('::ear{kind="intervals" set="P4,P5,P8"}').blocks[0]).toEqual({
			t: 'ear',
			kind: 'intervals',
			set: ['P8', 'P5', 'P4'],
			dir: 'asc',
			n: 10
		});
		expect(parse('::ear{kind="progressions" key="G" n=5}').blocks[0]).toMatchObject({
			set: ['I', 'V', 'IV', 'vi'],
			key: 'G',
			n: 5
		});
		expect(msgs('::ear{kind="smells"}')).toMatch(/unknown ear kind/);
		expect(msgs('::ear{kind="chords" set="major,blue"}')).toMatch(/unknown chords item "blue"/);
		expect(msgs('::ear{kind="chords" dir="asc"}')).toMatch(/dir= goes with/);
		expect(msgs('::ear{kind="intervals" n=99}')).toMatch(/3-30/);
	});
	it('::song and the new tool cards', () => {
		expect(parse('::song[Play along]{id="drunken-sailor" tempo=80}').blocks[0]).toEqual({
			t: 'song',
			id: 'drunken-sailor',
			tempo: 80,
			label: 'Play along'
		});
		expect(msgs('::song{id="x" tempo=500}')).toMatch(/25-150/);
		expect(msgs('::tool{name="ear" kind="intervals" set="P4,P5"}')).toBe('');
		expect(msgs('::tool{name="ear" kind="intervals" set="P4,Z"}')).toMatch(/unknown/);
		expect(msgs('::tool{name="fretboard" quiz="string-5"}')).toBe('');
		expect(msgs('::tool{name="fretboard" scale="major"}')).toMatch(/needs root/);
	});
});

const snap = (s: Partial<Snapshot> = {}): Snapshot => ({
	lessons: {},
	exercises: {},
	changeBest: {},
	confirmed: new Set(),
	...s
});

describe('ear and fretboard mastery', () => {
	const m = {
		type: 'ear' as const,
		kind: 'intervals' as const,
		set: ['P8', 'P5', 'P4'],
		accuracy: 80,
		min: 10
	};
	const a = (item: string, correct = true) => ({ item, correct });
	it('needs min answers, the accuracy and every item heard', () => {
		expect(earProgress(m, [])).toEqual({ done: false, value: 0, target: 80, count: 0 });
		const twoItems = Array.from({ length: 10 }, (_, i) => a(i % 2 ? 'P8' : 'P5'));
		expect(earProgress(m, twoItems).done).toBe(false);
		const all = Array.from({ length: 10 }, (_, i) => a(['P8', 'P5', 'P4'][i % 3], i !== 0));
		expect(earProgress(m, all)).toEqual({ done: true, value: 90, target: 80, count: 10 });
		const weak = all.map((x, i) => ({ ...x, correct: i > 2 }));
		expect(earProgress(m, weak).done).toBe(false);
		// Other items do not count; only the latest `min` answers do.
		expect(earProgress(m, [a('m2'), ...all]).count).toBe(10);
		expect(masteryProgress('l', m, snap({ ear: { intervals: all } })).done).toBe(true);
	});
	it('fretboard: the fastest passing round within target seconds', () => {
		const f = { type: 'fretboard' as const, quiz: 'string-6', target: 30 };
		expect(masteryProgress('l', f, snap())).toEqual({ done: false, value: 0, target: 30 });
		expect(masteryProgress('l', f, snap({ quizBest: { 'string-6': 31_200 } }))).toEqual({
			done: false,
			value: 31.2,
			target: 30
		});
		expect(masteryProgress('l', f, snap({ quizBest: { 'string-6': 29_000 } })).done).toBe(true);
	});
});

describe('planner drills', () => {
	const l6 = index.lessons.find((l) => l.id === 'notes-low-e-string') as Lesson;
	it('a lesson check is its drill', () => {
		expect(drillOf(l6)).toEqual({ type: 'fretboard', quiz: 'string-6', target: 30 });
		expect(drillOf(index.lessons.find((l) => l.id === 'minor-pentatonic-box-1')!)).toBeNull();
	});
	it('a reached but unpassed quiz becomes a technique block', () => {
		const states = Object.fromEntries(index.lessons.map((l) => [l.id, 'mastered' as const]));
		states[l6.id] = 'completed' as never;
		const plan = planSession(base({ lessonStates: states, next: null, minutes: 20 }));
		const drill = plan.blocks.find((b) => b.target.type === 'fretboard');
		expect(drill?.kind).toBe('technique');
		expect(drill?.title).toBe('Notes on string 6');
	});
});

describe('/api/ear and /api/fretboard', () => {
	let ear: ReturnType<typeof api>;
	let fb: ReturnType<typeof api>;
	beforeAll(() => {
		ear = api('/api/ear');
		fb = api('/api/fretboard');
	});
	const post = (body: unknown) => ({
		request: new Request('http://x', { method: 'POST', body: JSON.stringify(body) })
	});
	it('stores answers and returns history and per-item accuracy', async () => {
		let res = await ear.POST(post({ kind: 'intervals', item: 'P5', answer: 'P5' }));
		expect(res.status).toBe(201);
		res = await ear.POST(post({ kind: 'intervals', item: 'P5', answer: 'P4' }));
		const s = await res.json();
		expect(s.history.map((h: { correct: boolean }) => h.correct)).toEqual([true, false]);
		expect(s.items).toEqual([{ item: 'P5', total: 2, correct: 1 }]);
		const got = await (await ear.GET({ url: new URL('http://x/api/ear?kind=intervals') })).json();
		expect(got.history).toHaveLength(2);
	});
	it('rejects bad input', async () => {
		await expect(
			ear.POST(post({ kind: 'intervals', item: 'Q9', answer: 'P5' }))
		).rejects.toMatchObject({ status: 400 });
		await expect(ear.GET({ url: new URL('http://x/api/ear?kind=nope') })).rejects.toMatchObject({
			status: 400
		});
		await expect(
			fb.POST(post({ quiz: 'string-9', found: 7, wrong: 0, ms: 9000 }))
		).rejects.toMatchObject({ status: 400 });
	});
	it('fretboard rounds: best counts passing rounds only, and mastery follows', async () => {
		await fb.POST(post({ quiz: 'string-6', found: 7, wrong: 3, ms: 9_000 }));
		let s = await (
			await fb.POST(post({ quiz: 'string-6', found: 7, wrong: 0, ms: 25_000 }))
		).json();
		expect(s).toMatchObject({ quiz: 'string-6', tries: 2, best: 25_000 });
		s = await (await fb.GET()).json();
		expect(s[0].recent).toHaveLength(2);
		const progress = await (await api('/api/learn/progress').GET()).json();
		expect(progress.lessons['notes-low-e-string'].mastery).toEqual({
			done: true,
			value: 25,
			target: 30
		});
		expect(progress.skills['notes-string-6']).toBe('mastered');
	});
});
