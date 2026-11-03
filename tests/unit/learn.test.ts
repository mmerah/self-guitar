import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkLearnScores, loadLearn } from '../../src/lib/content/learn';
import { evaluate, masteryProgress, nextLesson, skillStatus } from '../../src/lib/learn/evaluate';
import type { Snapshot } from '../../src/lib/learn/evaluate';
import {
	ladderPct,
	ladderRate,
	ladderStart,
	scoreTempo,
	type LadderState
} from '../../src/lib/learn/ladder';
import {
	IN_APP_HREF,
	parseAttrs,
	parseInline,
	parseLesson,
	splitFrontMatter
} from '../../src/lib/learn/markdown';
import { parseStrum, strumCount, strumMeter, strumSlotAt } from '../../src/lib/learn/strum';
import { changesTarget, toolHref } from '../../src/lib/learn/tools';
import type { LearnIndex, Lesson, LessonState, Level } from '../../src/lib/learn/types';

const contentDir = path.resolve(__dirname, '../../content');

const messages = (body: string) => parseLesson(body).problems.map((p) => p.message);

describe('lesson markdown', () => {
	it('splits front-matter and reports the body line', () => {
		const fm = splitFrontMatter('---\nid: x\ntitle: y\n---\n\nHello');
		expect(fm).toEqual({ yaml: 'id: x\ntitle: y', body: '\nHello', bodyLine: 5 });
		expect(splitFrontMatter('no front matter')).toBeNull();
	});

	it('parses inline bold, italic, code and safe links', () => {
		expect(parseInline('a **b** _c_ `d` [e](/learn)')).toEqual([
			{ t: 'text', v: 'a ' },
			{ t: 'strong', c: [{ t: 'text', v: 'b' }] },
			{ t: 'text', v: ' ' },
			{ t: 'em', c: [{ t: 'text', v: 'c' }] },
			{ t: 'text', v: ' ' },
			{ t: 'code', v: 'd' },
			{ t: 'text', v: ' ' },
			{ t: 'link', href: '/learn', c: [{ t: 'text', v: 'e' }] }
		]);
		expect(parseInline('snake_case stays')).toEqual([{ t: 'text', v: 'snake_case stays' }]);
		const problems: string[] = [];
		parseInline('[x](javascript:alert(1))', problems);
		expect(problems[0]).toMatch(/must start with/);
	});

	it('keeps HTML as text and flags raw HTML lines', () => {
		const { blocks } = parseLesson('Use <b>tags</b> here');
		expect(blocks).toEqual([{ t: 'p', c: [{ t: 'text', v: 'Use <b>tags</b> here' }] }]);
		expect(messages('<script>alert(1)</script>')).toEqual(['raw HTML is not allowed in lessons']);
	});

	it('parses headings, paragraphs and lists', () => {
		const { blocks, problems } = parseLesson(
			'Intro line one\nline two\n\n## Head\n\n- a\n- b\n  continued\n\n1. one\n2. two'
		);
		expect(problems).toEqual([]);
		expect(blocks.map((b) => b.t)).toEqual(['p', 'h', 'list', 'list']);
		expect(blocks[0]).toEqual({ t: 'p', c: [{ t: 'text', v: 'Intro line one line two' }] });
		expect(blocks[2]).toMatchObject({
			ordered: false,
			items: [[{ v: 'a' }], [{ v: 'b continued' }]]
		});
		expect(blocks[3]).toMatchObject({ ordered: true });
		expect(messages('# Title')).toEqual([expect.stringMatching(/lesson title/)]);
	});

	it('compiles every directive and resolves chord names and slugs', () => {
		const { blocks, problems } = parseLesson(
			[
				'::chord{id="g" voicing="3-2-0-0-0-3"}',
				'::chords{ids="e-m, Am,c"}',
				'::exercise{id="open-string-pulse"}',
				'::strum{pattern="D - D U - U D U" bpm=70 chord="e-m"}',
				'::tool{name="changes" a="c" b="G"}',
				'::tool[Count along]{name="metronome" bpm=70 ts="3/4"}',
				'::tip[Short **tip**]',
				':::warning',
				'Careful.',
				':::',
				'```atex',
				':4 0.1 1.1 3.1 r',
				'```'
			].join('\n')
		);
		expect(problems).toEqual([]);
		expect(blocks).toEqual([
			{ t: 'chord', id: 'G', voicing: '3-2-0-0-0-3' },
			{ t: 'chords', ids: ['Em', 'Am', 'C'] },
			{ t: 'exercise', id: 'open-string-pulse' },
			{ t: 'strum', pattern: ['D', '-', 'D', 'U', '-', 'U', 'D', 'U'], bpm: 70, chord: 'Em' },
			{ t: 'tool', name: 'changes', params: { a: 'c', b: 'G' } },
			{ t: 'tool', name: 'metronome', params: { bpm: '70', ts: '3/4' }, label: 'Count along' },
			{
				t: 'callout',
				kind: 'tip',
				blocks: [
					{
						t: 'p',
						c: [
							{ t: 'text', v: 'Short ' },
							{ t: 'strong', c: [{ t: 'text', v: 'tip' }] }
						]
					}
				]
			},
			{ t: 'callout', kind: 'warning', blocks: [{ t: 'p', c: [{ t: 'text', v: 'Careful.' }] }] },
			{ t: 'atex', tex: ':4 0.1 1.1 3.1 r' }
		]);
	});

	it.each([
		['::video{id="x"}', /unknown directive/],
		['::chord{id="h"}', /unknown chord "h"/],
		['::chord{id="g" voicing="1-2-3"}', /no voicing "1-2-3"/],
		['::chord{id="g" size=3}', /no attribute "size"/],
		['::chords{ids="g"}', /2-6 ids/],
		['::exercise{}', /needs id=/],
		['::strum{pattern="D X D U" bpm=70}', /must be D, U or -/],
		['::strum{pattern="D - D" bpm=70}', /3 slots/],
		['::strum{pattern="D - D U - U D U" bpm=500}', /bpm must be/],
		['::tool{name="piano"}', /unknown tool/],
		['::tool{name="changes" a="C"}', /needs b=/],
		['::tool{name="changes" a="C" b="c"}', /two different chords/],
		['::tool{name="metronome" bpm=999}', /bpm: must be/],
		['::tool{name="tuner" tuning="nope"}', /tuning: must be one of/],
		['::tip', /needs \[text\]/],
		['::chord{id=g voicing}', /malformed attributes/],
		['```js\nx\n```', /must be ```atex/],
		['```atex\n:4 0.1', /never closed/],
		[':::tip\nunclosed', /never closed/],
		[':::note\nx\n:::', /unknown container/]
	])('rejects %s', (src, pattern) => {
		expect(messages(src).join('\n')).toMatch(pattern);
	});

	it('handles CRLF line endings and a byte-order mark', () => {
		const crlf = parseLesson('Intro\r\n\r\n## Head\r\n\r\n- a\r\n- b\r\n');
		expect(crlf.problems).toEqual([]);
		expect(crlf.blocks.map((b) => b.t)).toEqual(['p', 'h', 'list']);
		expect(crlf.blocks[2]).toMatchObject({ items: [[{ v: 'a' }], [{ v: 'b' }]] });
		const bom = parseLesson('\uFEFFHello');
		expect(bom.blocks).toEqual([{ t: 'p', c: [{ t: 'text', v: 'Hello' }] }]);
		const fm = splitFrontMatter('\uFEFF---\r\nid: x\r\n---\r\nBody');
		expect(fm).toMatchObject({ yaml: 'id: x', body: 'Body', bodyLine: 4 });
	});

	it('rejects nested lists and directives inside lists, with their line', () => {
		expect(parseLesson('- a\n  - nested', 10).problems).toEqual([
			{ line: 11, message: expect.stringMatching(/nested or indented lists/) }
		]);
		expect(messages('  1. indented')).toEqual([expect.stringMatching(/nested or indented/)]);
		expect(messages('- a\n  ::chord{id="g"}')).toEqual([
			expect.stringMatching(/directives cannot go inside a list/)
		]);
		expect(messages('- ::chord{id="g"}')).toEqual([
			expect.stringMatching(/directives cannot go inside a list/)
		]);
	});

	it.each([
		['> quoted', /block quotes/],
		['---', /horizontal rules/],
		['* * *', /horizontal rules/],
		['~~~\ncode\n~~~', /~~~ fences/],
		['````atex\n:4 0.1\n````', /4-backtick/],
		['| a | b |', /tables/]
	])('rejects unsupported Markdown: %s', (src, pattern) => {
		const found = messages(src);
		expect(found).toHaveLength(1);
		expect(found[0]).toMatch(pattern);
	});

	it('keeps years and wrapped numbers in paragraphs', () => {
		expect(parseLesson('2024. was a good year').blocks).toEqual([
			{ t: 'p', c: [{ t: 'text', v: '2024. was a good year' }] }
		]);
		expect(parseLesson('Practise until\n12. that is all').blocks.map((b) => b.t)).toEqual(['p']);
		expect(parseLesson('Steps:\n1. one\n2. two').blocks.map((b) => b.t)).toEqual(['p', 'list']);
	});

	it('only allows single-slash in-app links', () => {
		const problems: string[] = [];
		parseInline('[evil](//evil.example/x)', problems);
		expect(problems[0]).toMatch(/not "\/\/"/);
		expect(IN_APP_HREF.test('/learn')).toBe(true);
		expect(IN_APP_HREF.test('//evil.example')).toBe(false);
	});

	it('explains brackets inside a directive label', () => {
		expect(messages('::tip[See [this](/learn) first]')).toEqual([
			expect.stringMatching(/\[label\] cannot contain brackets/)
		]);
	});

	it('reports file line numbers', () => {
		const { problems } = parseLesson('ok\n\n::nope', 7);
		expect(problems).toEqual([{ line: 9, message: expect.stringMatching(/unknown directive/) }]);
	});

	it('parses attribute lists strictly', () => {
		expect(parseAttrs('a="x y" b=3')).toEqual({ a: 'x y', b: '3' });
		expect(parseAttrs('a="1" a="2"')).toBeNull();
		expect(parseAttrs('a="x" junk')).toBeNull();
	});
});

describe('strum patterns', () => {
	it('parses slots and picks the meter', () => {
		expect(parseStrum('D - D U')).toEqual({ slots: ['D', '-', 'D', 'U'] });
		expect(parseStrum('- - - -')).toEqual({ error: expect.stringMatching(/no strums/) });
		expect(strumMeter(4).timeSignature).toBe('2/4');
		expect(strumMeter(6).timeSignature).toBe('3/4');
		expect(strumMeter(8).timeSignature).toBe('4/4');
		expect(strumMeter(16)).toEqual({ beats: 4, timeSignature: '4/4' });
	});

	it('maps metronome 8th clicks to slots, across bars', () => {
		expect(strumSlotAt({ bar: 0, beat: 0, sub: 0 }, 8)).toBe(0);
		expect(strumSlotAt({ bar: 0, beat: 2, sub: 1 }, 8)).toBe(5);
		expect(strumSlotAt({ bar: 1, beat: 0, sub: 0 }, 8)).toBe(0);
		expect(strumSlotAt({ bar: 1, beat: 1, sub: 1 }, 16)).toBe(11);
		expect([0, 1, 2, 3, 4, 5].map((i) => strumCount(i, 6)).join(' ')).toBe('1 & 2 & 3 &');
	});
});

describe('tool links', () => {
	it('builds pre-configured tool URLs', () => {
		expect(toolHref('changes', { a: 'c', b: 'g' })).toBe('/tools/changes?a=C&b=G');
		expect(toolHref('metronome', { bpm: '70', ts: '3/4' })).toBe(
			'/tools/metronome?bpm=70&ts=3%2F4'
		);
		expect(toolHref('tuner', {})).toBe('/tools/tuner');
		expect(toolHref('changes', { a: 'c', b: 'g' }, { from: 'l1', target: 30 })).toBe(
			'/tools/changes?a=C&b=G&target=30&from=l1'
		);
	});

	it("passes a lesson's changes goal only for the same pair", () => {
		const m = { type: 'changes' as const, a: 'G', b: 'c', target: 40 };
		expect(changesTarget(m, { a: 'C', b: 'g' })).toBe(40);
		expect(changesTarget(m, { a: 'C', b: 'D' })).toBeUndefined();
		expect(changesTarget(undefined, { a: 'C', b: 'G' })).toBeUndefined();
	});
});

describe('tempo ladder', () => {
	const cfg = { startBpm: 60, targetBpm: 72, step: 4, cleanReps: 3 };
	const run = (from: LadderState, ratings: boolean[]) => {
		let st = from;
		const events: string[] = [];
		for (const clean of ratings) {
			const r = ladderRate(cfg, st, clean);
			events.push(`${r.event}@${r.state.bpm}`);
			st = r.state;
		}
		return { state: st, events };
	};

	it('starts at startBpm or where the ladder was left, within the ladder', () => {
		expect(ladderStart(cfg)).toEqual({ bpm: 60, streak: 0, misses: 0 });
		expect(ladderStart(cfg, { bpm: 68, streak: 2, misses: 1 })).toEqual({
			bpm: 68,
			streak: 2,
			misses: 1
		});
		expect(ladderStart(cfg, { bpm: 40 }).bpm).toBe(60);
		expect(ladderStart(cfg, { bpm: 99 }).bpm).toBe(72);
	});

	it('goes up a step after cleanReps cleans in a row', () => {
		expect(run(ladderStart(cfg), [true, true, true, true]).events).toEqual([
			'clean@60',
			'clean@60',
			'up@64',
			'clean@64'
		]);
	});

	it('one miss resets the streak; only two misses in a row drop a step', () => {
		const at64 = { bpm: 64, streak: 2, misses: 0 };
		expect(run(at64, [false]).state).toEqual({ bpm: 64, streak: 0, misses: 1 });
		expect(run(at64, [false, true, false]).events).toEqual(['miss@64', 'clean@64', 'miss@64']);
		expect(run(at64, [false, false]).events).toEqual(['miss@64', 'down@60']);
		expect(run(at64, [false, false]).state).toEqual({ bpm: 60, streak: 0, misses: 0 });
	});

	it('a miss never drops below startBpm', () => {
		const r = run(ladderStart(cfg), [false, false, false, false]);
		expect(r.events).toEqual(['miss@60', 'miss@60', 'miss@60', 'miss@60']);
		expect(r.state.bpm).toBe(60);
	});

	it('masters with cleanReps clean in a row at the target, not with one pass', () => {
		const r = run({ bpm: 72, streak: 0, misses: 0 }, [true, true, false, true, true, true]);
		expect(r.events).toEqual([
			'clean@72',
			'clean@72',
			'miss@72',
			'clean@72',
			'clean@72',
			'mastered@72'
		]);
	});

	it('maps a BPM onto the ladder, clamped', () => {
		expect(ladderPct(cfg, null)).toBe(0);
		expect(ladderPct(cfg, 66)).toBe(50);
		expect(ladderPct(cfg, 40)).toBe(0);
		expect(ladderPct(cfg, 99)).toBe(100);
	});

	it('reads the score tempo', () => {
		expect(scoreTempo('\\title "x"\n\\tempo 84\n:4 0.1')).toBe(84);
		expect(scoreTempo(':4 0.1')).toBe(120);
	});
});

// ---- evaluation --------------------------------------------------------------------------------

const lesson = (id: string, skills: string[], extra: Partial<Lesson> = {}): Lesson => ({
	id,
	title: id,
	level: 0,
	unit: 'u',
	skills,
	prereqs: [],
	minutes: 5,
	order: 0,
	blocks: [],
	...extra
});
const snap = (s: Partial<Snapshot> = {}): Snapshot => ({
	lessons: {},
	exercises: {},
	changeBest: {},
	confirmed: new Set(),
	...s
});

describe('mastery evaluation', () => {
	it('changes: best of the pair (any spelling or order) >= target', () => {
		const m = { type: 'changes' as const, a: 'g', b: 'C', target: 30 };
		expect(masteryProgress('l', m, snap({ changeBest: { 'C|G': 29 } }))).toEqual({
			done: false,
			value: 29,
			target: 30
		});
		expect(masteryProgress('l', m, snap({ changeBest: { 'C|G': 31 } })).done).toBe(true);
	});

	it('exercise: a full clean streak at >= bpm (one clean pass is not enough)', () => {
		const m = { type: 'exercise' as const, id: 'ex', bpm: 80 };
		const ex = (best: number, streakBest: number | null) =>
			snap({ exercises: { ex: { best, streakBest, mastered: false } } });
		expect(masteryProgress('l', m, snap()).done).toBe(false);
		expect(masteryProgress('l', m, ex(80, 76))).toEqual({ done: false, value: 80, target: 80 });
		expect(masteryProgress('l', m, ex(80, 80)).done).toBe(true);
	});

	it('self and tuner: a confirmed record for the lesson', () => {
		expect(masteryProgress('l', { type: 'tuner' }, snap()).done).toBe(false);
		expect(
			masteryProgress('l', { type: 'self', items: ['abc'] }, snap({ confirmed: new Set(['l']) }))
				.done
		).toBe(true);
	});
});

describe('skill status', () => {
	const a = lesson('a', ['s1', 's2'], { mastery: { type: 'tuner' } });
	const b = lesson('b', ['s2']);
	const lessons = [a, b];

	it('is new until a lesson teaching it is started', () => {
		expect(skillStatus('s1', lessons, snap())).toBe('new');
		expect(skillStatus('s1', lessons, snap({ lessons: { a: 'started' } }))).toBe('learning');
		expect(skillStatus('nobody-teaches', lessons, snap())).toBe('new');
	});

	it('is mastered when every lesson teaching it is satisfied', () => {
		const s = snap({ lessons: { a: 'completed' }, confirmed: new Set(['a']) });
		expect(skillStatus('s1', lessons, s)).toBe('mastered');
		// s2 also needs lesson b (no check: completing it counts).
		expect(skillStatus('s2', lessons, s)).toBe('learning');
		expect(skillStatus('s2', lessons, { ...s, lessons: { a: 'completed', b: 'completed' } })).toBe(
			'mastered'
		);
	});

	it('derives lesson states, mastered levels and the next lesson', () => {
		const levels: Level[] = [
			{
				id: 0,
				title: 'L0',
				goal: 'g',
				units: [{ id: 'u', title: 'U', skills: [{ id: 's1', name: 'S1', description: '' }] }]
			},
			{ id: 1, title: 'L1', goal: 'g', units: [] }
		];
		const c = lesson('c', ['s1'], { prereqs: ['a'] });
		const index: LearnIndex = { levels, lessons: [a, c], exercises: [] };

		const fresh = evaluate(index, snap());
		expect(fresh.lessons.a.state).toBe('new');
		expect(fresh.next?.id).toBe('a');
		expect(fresh.masteredLevels).toEqual([]);

		const done = evaluate(
			index,
			snap({ lessons: { a: 'completed', c: 'completed' }, confirmed: new Set(['a']) })
		);
		expect(done.lessons.a).toEqual({ state: 'mastered', mastery: { done: true } });
		expect(done.lessons.c.state).toBe('mastered');
		expect(done.skills.s1).toBe('mastered');
		expect(done.masteredLevels).toEqual([0]);
		expect(done.next).toBeNull();
	});

	describe('next lesson', () => {
		const ids = ['a0', 'b0', 'c0', 'a1', 'b1', 'c1'];
		const index: LearnIndex = {
			levels: [],
			lessons: ids.map((id) => lesson(id, ['s'], { level: Number(id[1]) })),
			exercises: []
		};
		const next = (states: Record<string, LessonState>, touched: Record<string, number> = {}) =>
			nextLesson(index, states, touched)?.id;

		it('starts with the first lesson', () => {
			expect(next({})).toBe('a0');
		});

		it('prefers the most recently started unfinished lesson', () => {
			expect(next({ a0: 'started', a1: 'started' }, { a0: 2, a1: 1 })).toBe('a0');
			expect(next({ a0: 'started', a1: 'started' }, { a0: 1, a1: 2 })).toBe('a1');
		});

		it('never goes back to a skipped earlier lesson once further on', () => {
			// Mid-L1 (a1 done), L0's b0/c0 never opened: continue after a1.
			expect(next({ a0: 'completed', a1: 'mastered' })).toBe('b1');
			expect(next({ a0: 'completed', a1: 'completed', b1: 'completed', c1: 'completed' })).toBe(
				'b0'
			);
		});
	});
});

// ---- content loading -----------------------------------------------------------------------------

describe('curriculum content', () => {
	const { index, errors } = loadLearn(contentDir);

	it('loads the real content without errors, with Level 0 complete', () => {
		expect(errors).toEqual([]);
		expect(index.levels.map((l) => l.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		const l0 = index.lessons.filter((l) => l.level === 0);
		expect(l0.length).toBeGreaterThanOrEqual(5);
		expect(l0[0].id).toBe('meet-your-guitar');
		for (const level of index.levels.slice(0, 4)) expect(level.units.length).toBeGreaterThan(0);
	});

	it('parses every exercise score and inline tab', () => {
		expect(checkLearnScores(index)).toEqual([]);
	});

	function tempContent(files: Record<string, string>) {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'self-guitar-content-'));
		for (const [file, text] of Object.entries(files)) {
			fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
			fs.writeFileSync(path.join(dir, file), text);
		}
		return dir;
	}
	const levels: Level[] = [
		{
			id: 0,
			title: 'L0',
			goal: 'g',
			units: [
				{
					id: 'u0',
					title: 'U',
					skills: [
						{ id: 's1', name: 'S1', description: 'd' },
						{ id: 's2', name: 'S2', description: 'd' }
					]
				}
			]
		},
		{
			id: 1,
			title: 'L1',
			goal: 'g',
			units: [{ id: 'u1', title: 'U1', skills: [{ id: 's3', name: 'S3', description: 'd' }] }]
		}
	];
	const md = (fm: string, body = 'Intro.') => `---\n${fm}\n---\n\n${body}\n`;

	it('reports front-matter, reference, order and coverage problems', () => {
		const dir = tempContent({
			'lessons/L0/a.md': md(
				'id: a\ntitle: Lesson A\nlevel: 0\nunit: u0\nskills: [s1]\nprereqs: [b]\nminutes: 5'
			),
			'lessons/L0/b.md': md(
				'id: b\ntitle: Lesson B\nlevel: 0\nunit: u0\nskills: [s1]\nprereqs: [a]\nminutes: 5\norder: 2'
			),
			'lessons/L0/c.md': md(
				'id: c\ntitle: Lesson C\nlevel: 0\nunit: nope\nskills: [zz]\nminutes: 5'
			),
			'lessons/L0/d.md': md(
				'id: wrong\ntitle: Lesson D\nlevel: 0\nunit: u0\nskills: [s1]\nminutes: 5'
			),
			'lessons/L0/e.md': md(
				'id: e\ntitle: Lesson E\nlevel: 0\nunit: u0\nskills: [s1]\nminutes: 5\nmastery:\n  type: exercise\n  id: missing\n  bpm: 80'
			),
			'lessons/L0/f.md': md('id: f\ntitle: Lesson F\nlevel: 0\nunit: u0\nskills: [s1]\nminutes: 0'),
			'lessons/L0/g.md': md(
				'id: g\ntitle: Lesson G\nlevel: 0\nunit: u0\nskills: [s1]\nminutes: 5',
				'Intro.\n\n::exercise{id="ghost"}\n\n::chord{id="q"}'
			),
			'lessons/L0/h.md': 'no front matter'
		});
		const { errors, warnings } = loadLearn(dir, levels);
		const all = errors.join('\n');
		expect(all).toMatch(/a\.md: prereq "b" comes later/);
		expect(all).toMatch(/prereq cycle (a -> b -> a|b -> a -> b)/);
		expect(all).toMatch(/c\.md: unknown unit "nope"/);
		expect(all).toMatch(/c\.md: unknown skill "zz"/);
		expect(all).toMatch(/d\.md: id "wrong" must match the file name/);
		expect(all).toMatch(/e\.md: mastery: unknown exercise "missing"/);
		expect(all).toMatch(/f\.md: front-matter minutes/);
		expect(all).toMatch(/g\.md: ::exercise: unknown exercise "ghost"/);
		expect(all).toMatch(/g\.md:14: unknown chord "q"/);
		expect(all).toMatch(/h\.md: missing front-matter/);
		// Level 0 coverage is required; later planned levels only warn.
		expect(all).toMatch(/level 0: no lesson teaches s2/);
		expect(warnings.join('\n')).toMatch(/level 1: no lesson teaches s3/);
	});

	it('validates exercises and their use', () => {
		const dir = tempContent({
			'exercises/ex/meta.json': JSON.stringify({
				id: 'ex',
				title: 'Exercise',
				skills: ['s1'],
				startBpm: 60,
				targetBpm: 80
			}),
			'exercises/ex/score.atex': '\\tempo 80\n:4 0.1 0.1 0.1 0.1',
			'exercises/bad/meta.json': JSON.stringify({
				id: 'bad',
				title: 'Bad one',
				skills: ['zz'],
				startBpm: 90,
				targetBpm: 80
			}),
			'exercises/bad/score.atex': ':4 0.1',
			'lessons/L0/a.md': md(
				'id: a\ntitle: Lesson A\nlevel: 0\nunit: u0\nskills: [s1, s2]\nminutes: 5\nmastery:\n  type: exercise\n  id: ex\n  bpm: 90'
			)
		});
		const { index, errors, warnings } = loadLearn(dir, levels);
		expect(errors.join('\n')).toMatch(/bad\/meta.json: \(root\): startBpm must be below targetBpm/);
		expect(errors.join('\n')).toMatch(/bpm 90 is outside ex's ladder \(60-80\)/);
		expect(index.exercises).toEqual([expect.objectContaining({ id: 'ex', step: 4, cleanReps: 3 })]);
		expect(warnings).toContain('exercises/ex: not used by any lesson');
	});
});
