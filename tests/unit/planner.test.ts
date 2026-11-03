import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../../src/lib/learn/review';
import { planSession, splitMinutes, targetKey } from '../../src/lib/session/planner';
import { addDays } from '../../src/lib/session/time';
import type { Plan, PlanBlock } from '../../src/lib/session/types';
import {
	base,
	index,
	NOW,
	scenarioA,
	scenarioB,
	scenarioC,
	scenarioD,
	sig,
	songs
} from './planner-fixtures';

const total = (p: Plan) => p.blocks.reduce((a, b) => a + b.minutes, 0);
const kinds = (p: Plan) => p.blocks.map((b) => b.kind);
const minutesOf = (p: Plan, kind: string) =>
	p.blocks.filter((b) => b.kind === kind).reduce((a, b) => a + b.minutes, 0);

const SCENARIOS = { a: scenarioA, b: scenarioB, c: scenarioC, d: scenarioD };
const LENGTHS = [5, 10, 15, 20, 30];

describe('minutes', () => {
	it('splits by the template with minimums and caps, always adding up', () => {
		const all = { warmup: true, new: true, technique: true, review: true, song: true };
		expect(splitMinutes(15, all)).toEqual({ warmup: 2, new: 5, technique: 3, review: 2, song: 3 });
		expect(splitMinutes(5, all)).toEqual({ warmup: 1, new: 4 });
		expect(splitMinutes(5, { warmup: true, song: true })).toEqual({ warmup: 1, song: 4 });
		// A reading-only lesson gets at most 5 minutes: the rest goes to technique, then the song.
		expect(
			splitMinutes(15, { warmup: true, new: true, technique: true, song: true }, { reading: true })
		).toEqual({ warmup: 2, new: 5, technique: 5, song: 3 });
		expect(splitMinutes(15, { warmup: true })).toEqual({ warmup: 15 });
		for (let m = 5; m <= 30; m++) {
			const s = splitMinutes(m, all);
			expect(Object.values(s).reduce((a, b) => a + b!, 0)).toBe(m);
		}
	});
});

describe('planner proportions: scenarios a–d at 5/10/15/20/30 minutes', () => {
	for (const [name, scenario] of Object.entries(SCENARIOS))
		for (const m of LENGTHS)
			it(`(${name}) ${m} min`, () => {
				const p = planSession(scenario({ minutes: m }));
				expect(total(p)).toBe(m);
				const warm = minutesOf(p, 'warmup');
				const base = m < 10 ? 1 : Math.max(2, Math.round(m * 0.1));
				// A routine's slot grows toward the routine's length, within ~15% of the session.
				if (p.blocks[0].target.type === 'warmup') {
					const w = index.warmups.find((x) => x.id === (p.blocks[0].target as { id: string }).id)!;
					expect(warm).toBe(
						m < 7 ? base : Math.max(base, Math.min(w.minutes, Math.max(2, Math.floor(m * 0.15))))
					);
					expect(p.blocks[0].why).toContain(`${warm} minute`);
				} else expect(warm).toBe(base);
				expect(warm).toBeLessThanOrEqual(Math.max(2, m * 0.15));
				// No 1-minute blocks except the warm-up of a short session.
				for (const b of p.blocks)
					if (b.kind !== 'warmup') expect(b.minutes).toBeGreaterThanOrEqual(2);
				for (const b of p.blocks)
					if (b.kind === 'song') expect(b.minutes).toBeGreaterThanOrEqual(3);
				// 5 minutes: the warm-up and one main block (a lesson or a song, not both).
				if (m === 5) expect(p.blocks).toHaveLength(2);
				else expect(kinds(p)).toContain('song');
				// Never the same item twice; at most one lesson (one new concept).
				const keys = p.blocks.map((b) => targetKey(b.target));
				expect(new Set(keys).size).toBe(keys.length);
				expect(p.blocks.filter((b) => b.target.type === 'lesson').length).toBeLessThanOrEqual(1);
				// No main block takes over: at most half the session (the song in short ones).
				for (const b of p.blocks)
					if (b.kind !== 'song' && m >= 10) expect(b.minutes).toBeLessThanOrEqual(m / 2);
				for (const b of p.blocks) expect(b.why.length).toBeGreaterThan(8);
			});
});

describe('session planner', () => {
	it('(a) new user: tune 2 · the first lesson ≤ 5 (reading) · a first easy ladder · a song', () => {
		const p = planSession(scenarioA());
		expect(kinds(p)).toEqual(['warmup', 'new', 'technique', 'song']);
		expect(p.blocks.map((b) => b.minutes)).toEqual([2, 5, 5, 3]);
		expect(p.blocks[0].target).toEqual({ type: 'tool', id: 'tuner', params: {} });
		expect(p.blocks[1].target).toEqual({ type: 'lesson', id: index.lessons[0].id });
		expect(p.blocks[1].why).toMatch(/one new idea/);
		expect(p.blocks[2].target).toEqual({ type: 'exercise', id: 'open-string-pulse' });
		expect(p.blocks[2].why).toMatch(/first taste/);
		const song = p.blocks[3].target;
		expect(song.type === 'song' && songs.find((s) => s.id === song.id)!.level).toBe(0);
		expect(p.due).toBe(0);
	});

	it('(b) Level 0 done: the first Level 1 lesson gets the most time, a known ladder kept fresh', () => {
		const p = planSession(scenarioB());
		expect(kinds(p)).toEqual(['warmup', 'new', 'technique', 'song']);
		const lesson = p.blocks.find((b) => b.kind === 'new')!;
		expect(lesson.target).toEqual({ type: 'lesson', id: 'chord-e' });
		expect(lesson.minutes).toBe(6);
		expect(p.blocks.find((b) => b.kind === 'technique')!.why).toMatch(/Keep it at/);
	});

	it('(c) mid-L1: changes + weak ladder, continue the lesson, due reviews, a song', () => {
		const s = scenarioC({ minutes: 20 });
		const p = planSession(s);
		expect(kinds(p)).toEqual(['warmup', 'new', 'technique', 'technique', 'review', 'song']);
		const [ch, ex] = p.blocks.filter((b) => b.kind === 'technique');
		expect(ch.target).toMatchObject({ type: 'changes', a: 'Am', b: 'Em', target: 30 });
		expect(ch.minutes).toBe(2);
		expect(ch.why).toMatch(/Best 18\/min, goal 30/);
		expect(ex.target).toEqual({ type: 'exercise', id: 'em-e-quarters' });
		const newBlock = p.blocks.find((b) => b.kind === 'new')!;
		expect(newBlock.target).toEqual({ type: 'lesson', id: s.next });
		expect(newBlock.why).toMatch(/Continue/);
		expect(p.due).toBe(2);
		// Long session: both due skills, in two blocks.
		const long = planSession(scenarioC({ minutes: 30 }));
		expect(long.blocks.filter((b) => b.kind === 'review').flatMap((b) => b.skills)).toEqual(
			expect.arrayContaining(['read-tab', 'first-strum'])
		);
	});

	it('(d) everything mastered: technique, songs and the oldest skills kept fresh', () => {
		const p = planSession(scenarioD());
		expect(kinds(p)).toEqual(['warmup', 'technique', 'review', 'song']);
		expect(p.blocks.find((b) => b.kind === 'review')!.why).toMatch(/Keep it fresh/);
		expect(minutesOf(p, 'warmup')).toBe(2);
		expect(p.due).toBe(0);
	});

	it('warm-up: tune after a break (or the first session), else a daily rotation', () => {
		expect(planSession(scenarioB({ recent: [] })).blocks[0].title).toBe('Tune up');
		expect(
			planSession(scenarioB({ recent: [{ date: '2026-10-30', blocks: [] }] })).blocks[0].title
		).toBe('Tune up');
		const dates = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
		const warmups = dates.map(
			(date) =>
				planSession(scenarioB({ date, recent: [{ date: addDays(date, -1), blocks: [] }] }))
					.blocks[0]
		);
		// A different routine each day, all of them warm-up routines at the learner's level (1).
		expect(new Set(warmups.map((b) => b.title)).size).toBe(4);
		for (const b of warmups) {
			expect(b.target.type).toBe('warmup');
			const w = index.warmups.find((x) => b.target.type === 'warmup' && x.id === b.target.id)!;
			expect(w.level).toBe(1);
			// The why gives the block's own minutes.
			expect(b.why).toContain(`${b.minutes} minute`);
		}
	});

	it('warm-up rotation looks back a week, not three sessions', () => {
		const date = '2026-11-08';
		const first = planSession(
			scenarioB({ date, recent: [{ date: addDays(date, -1), blocks: [] }] })
		).blocks[0];
		expect(first.target.type).toBe('warmup');
		// Played five sessions ago (still this week): another routine today.
		const recent = [1, 2, 3, 4].map((d) => ({
			date: addDays(date, -d),
			blocks: [] as PlanBlock[]
		}));
		recent.push({ date: addDays(date, -5), blocks: [{ ...first }] });
		const again = planSession(scenarioB({ date, recent })).blocks[0];
		expect(again.target).not.toEqual(first.target);
	});

	it('warm-up routines: level-gated, and not the one of the last sessions', () => {
		// A Level 1 learner never gets a Level 2+ routine (pentatonic ones wait for Level 5).
		for (const date of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']) {
			const t = planSession(scenarioB({ date, recent: [{ date: addDays(date, -1), blocks: [] }] }))
				.blocks[0].target;
			const w = index.warmups.find((x) => t.type === 'warmup' && x.id === t.id)!;
			expect(w.level).toBeLessThanOrEqual(1);
		}
		// Yesterday's routine is not today's.
		const date = '2026-11-04';
		const first = planSession(
			scenarioB({ date, recent: [{ date: addDays(date, -1), blocks: [] }] })
		);
		const again = planSession(
			scenarioB({ date, recent: [{ date: addDays(date, -1), blocks: first.blocks }] })
		);
		expect(targetKey(again.blocks[0].target)).not.toBe(targetKey(first.blocks[0].target));
		expect(again.blocks[0].target.type).toBe('warmup');
	});

	it('due reviews: most overdue first, with a "last practised" reason', () => {
		const s = scenarioC({
			skills: [
				{ id: 'first-strum', status: 'mastered', dueAt: NOW - 5 * DAY_MS, ease: 2 },
				{ id: 'read-tab', status: 'mastered', dueAt: NOW + 3 * DAY_MS, ease: 1 }
			]
		});
		const p = planSession(s);
		expect(p.due).toBe(1);
		const reviews = p.blocks.filter((b) => b.kind === 'review');
		expect(reviews).toHaveLength(1);
		expect(reviews[0].skills).toEqual(['first-strum']);
		expect(reviews[0].target).toEqual({ type: 'exercise', id: 'em-down-strums' });
		// ease 2 = 7-day interval, due 5 days ago: last practised 12 days ago.
		expect(reviews[0].why).toBe('Due for review — last practised 12 days ago');
	});

	it('a due skill the warm-up trains is reviewed by the warm-up block', () => {
		// fretting-hand is trained by the routine that runs the 1-2-3-4 ladder (first-warm-up).
		const p = planSession(
			scenarioC({
				skills: [{ id: 'fretting-hand', status: 'mastered', dueAt: NOW - DAY_MS, ease: 1 }]
			})
		);
		const warm = p.blocks[0];
		expect(warm.target).toEqual({ type: 'warmup', id: 'first-warm-up' });
		expect(warm.skills).toEqual(['fretting-hand']);
		expect(warm.why).toMatch(/review of fretting hand — last practised 4 days ago/);
		expect(kinds(p)).not.toContain('review');
	});

	it('a lapsed skill is reviewed with a gentle reason', () => {
		const p = planSession(
			scenarioC({
				skills: [{ id: 'first-strum', status: 'learning', dueAt: NOW - DAY_MS, ease: 0 }]
			})
		);
		expect(p.blocks.find((b) => b.kind === 'review')!.why).toMatch(/slipped last time/);
	});

	it('is deterministic for a state + date, and the date rotates tie-breaks', () => {
		const s = scenarioC();
		expect(planSession(s)).toEqual(planSession(structuredClone(s)));
		const picks = new Set(
			['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'].map(
				(date) => {
					const t = planSession({ ...s, date }).blocks.find((b) => b.kind === 'song')!.target;
					return t.type === 'song' ? t.id : '';
				}
			)
		);
		expect(picks.size).toBeGreaterThan(1);
	});

	it('avoids the song and technique items of the last session', () => {
		const s = scenarioC({ minutes: 20 });
		const first = planSession(s);
		const again = planSession({ ...s, recent: [{ date: '2026-11-02', blocks: first.blocks }] });
		const song = (p: Plan) => p.blocks.find((b) => b.kind === 'song')!.target;
		expect(targetKey(song(again))).not.toBe(targetKey(song(first)));
		const ex = (p: Plan) =>
			p.blocks.find((b) => b.kind === 'technique' && b.target.type === 'exercise');
		expect(targetKey(ex(again)!.target)).not.toBe(targetKey(ex(first)!.target));
	});

	it('suggests a tempo from the best played tempo, and keeps a saved loop', () => {
		const s = scenarioC({
			songs: songs.map((x) =>
				x.level === 1
					? { ...x, lastPlayedAt: NOW - 10 * DAY_MS, maxTempoPct: 72, loop: { start: 2, end: 5 } }
					: { ...x, level: 9 }
			)
		});
		const t = planSession(s).blocks.find((b) => b.kind === 'song')!.target;
		expect(t).toMatchObject({ type: 'song', tempoPct: 75, loop: { start: 2, end: 5 } });
	});

	it('a ladder already at its target is kept fresh, not "climbing"', () => {
		const target = index.exercises.find((e) => e.id === 'em-e-quarters')!.targetBpm;
		const s = scenarioC({
			minutes: 30,
			exercises: { 'em-e-quarters': sig({ recentClean: 10, recentTotal: 10, ladderBpm: target }) }
		});
		const block = planSession(s).blocks.find(
			(b) => b.target.type === 'exercise' && b.target.id === 'em-e-quarters'
		)!;
		expect(block.why).toBe(`Keep it fresh at ${target} BPM`);
	});

	it('content exhausted: consolidates the weakest ladder instead of a new lesson', () => {
		const p = planSession(scenarioD({ exercises: { 'travis-c-g-am': sig({ recentClean: 2 }) } }));
		const block = p.blocks.find((b) => b.kind === 'new')!;
		expect(block.target).toEqual({ type: 'exercise', id: 'travis-c-g-am' });
		expect(block.why).toMatch(/Every lesson so far is done/);
		expect(total(p)).toBe(15);
	});

	it('a tuning lesson is its own warm-up: 5 minutes is that lesson alone', () => {
		const first = index.lessons[0].id;
		const state = base({
			minutes: 5,
			lessonStates: { [first]: 'completed' },
			next: 'tune-up',
			recent: [{ date: '2026-11-03', blocks: [] }]
		});
		const p = planSession(state);
		expect(p.blocks).toEqual([
			expect.objectContaining({
				kind: 'new',
				minutes: 5,
				target: { type: 'lesson', id: 'tune-up' }
			})
		]);
		// Longer sessions still have no separate tuning block.
		const long = planSession({ ...state, minutes: 15 });
		expect(long.blocks.some((b) => b.target.type === 'tool' && b.target.id === 'tuner')).toBe(
			false
		);
		expect(total(long)).toBe(15);
	});

	it('degrades with no content at all, and clamps the length', () => {
		const p = planSession(
			base({
				index: { levels: [], lessons: [], exercises: [], warmups: [] },
				next: null,
				songs: []
			})
		);
		expect(p.blocks.map((b) => b.target.type)).toEqual(['tool']);
		expect(total(p)).toBe(15);
		expect(planSession(scenarioC({ minutes: 90 })).minutes).toBe(30);
		expect(planSession(scenarioC({ minutes: 1 })).minutes).toBe(5);
	});
});
