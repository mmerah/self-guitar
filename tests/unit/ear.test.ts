import { describe, expect, it } from 'vitest';
import {
	EarTrainer,
	LEVEL_WINDOW,
	unlocked,
	itemStats,
	type EarAnswer
} from '../../src/lib/ear/trainer';
import { DEFAULT_SET, orderSet, parseEarSet } from '../../src/lib/ear/items';
import {
	chordQuestion,
	intervalQuestion,
	progressionQuestion,
	voiceChord
} from '../../src/lib/ear/questions';

const ans = (item: string, correct: boolean, answer = correct ? item : 'X'): EarAnswer => ({
	item,
	answer,
	correct
});
/** A deterministic random source. */
const seq = (...xs: number[]) => {
	let i = 0;
	return () => xs[i++ % xs.length];
};

describe('ear items', () => {
	it('sets are kept in teaching order and checked', () => {
		expect(orderSet('intervals', ['m2', 'P5', 'P8'])).toEqual(['P8', 'P5', 'm2']);
		const problems: string[] = [];
		expect(parseEarSet('intervals', 'P4,P5,P8', problems)).toEqual(['P8', 'P5', 'P4']);
		parseEarSet('intervals', 'P4,Q9', problems);
		expect(problems.join()).toMatch(/unknown intervals item "Q9"/);
		const few: string[] = [];
		parseEarSet('chords', 'major', few);
		expect(few.join()).toMatch(/at least 2/);
		expect(DEFAULT_SET.progressions).toEqual(['I', 'V', 'IV', 'vi']);
	});
});

describe('adaptive choices', () => {
	const set = ['P8', 'P5', 'P4', 'M3'];
	it('starts with two choices', () => {
		expect(unlocked([], set)).toBe(2);
		expect(new EarTrainer(set).active).toEqual(['P8', 'P5']);
	});
	it('unlocks one more at 80% over the last 20 answers', () => {
		const h: EarAnswer[] = [];
		for (let i = 0; i < LEVEL_WINDOW - 1; i++) h.push(ans(i % 2 ? 'P8' : 'P5', i % 5 !== 0));
		expect(unlocked(h, set)).toBe(2);
		h.push(ans('P8', true));
		// 20 answers, 16 right = 80%.
		expect(unlocked(h, set)).toBe(3);
	});
	it('does not unlock below 80%, and answers outside the choices do not count', () => {
		const h: EarAnswer[] = [];
		for (let i = 0; i < 20; i++) h.push(ans('P8', i % 4 !== 0)); // 75%
		expect(unlocked(h, set)).toBe(2);
		const other = Array.from({ length: 30 }, () => ans('M3', true));
		expect(unlocked(other, set)).toBe(2);
	});
	it('the trainer unlocks live and reports it', () => {
		const t = new EarTrainer(set, [], seq(0.1, 0.9));
		let unlockedItem: string | null = null;
		for (let i = 0; i < 20; i++) {
			const item = t.next();
			unlockedItem = t.answer(item, item).unlockedItem ?? unlockedItem;
		}
		expect(unlockedItem).toBe('P4');
		expect(t.active).toEqual(['P8', 'P5', 'P4']);
		expect(t.streak).toBe(20);
	});
});

describe('question choice', () => {
	it('never asks the same item twice in a row', () => {
		const t = new EarTrainer(['P8', 'P5', 'P4'], [], seq(0, 0, 0, 0));
		let last = '';
		for (let i = 0; i < 10; i++) {
			const item = t.next();
			expect(item).not.toBe(last);
			t.answer(item, item);
			last = item;
		}
	});
	it('a confusion comes back: the item after 2 questions, the answer after 4', () => {
		const t = new EarTrainer(['P8', 'P5'], [], seq(0.99));
		t.answer('P5', 'P8'); // heard P5, said P8
		const asked: string[] = [];
		for (let i = 0; i < 5; i++) {
			const item = t.next();
			asked.push(item);
			t.answer(item, item);
		}
		// Q3 would repeat P5 (never twice in a row), so it comes at Q4; P8 is due at Q5.
		expect(asked).toEqual(['P8', 'P5', 'P8', 'P5', 'P8']);
		expect(t.streak).toBe(5);
	});
	it('weaker items are asked more often', () => {
		const history = [
			...Array.from({ length: 10 }, () => ans('P8', true)),
			...Array.from({ length: 10 }, () => ans('P5', false, 'P8'))
		];
		const t = new EarTrainer(['P8', 'P5'], history, Math.random);
		// The confused pair is queued first: P5, then P8.
		expect(t.next()).toBe('P5');
		const stats = itemStats(history);
		expect(stats.P5).toEqual({ total: 10, correct: 0 });
	});
});

describe('questions', () => {
	it('intervals in each direction', () => {
		const up = intervalQuestion('P5', 'asc', () => 0);
		expect(up.notes).toEqual([48, 55]);
		const down = intervalQuestion('P5', 'desc', () => 0);
		expect(down.notes).toEqual([55, 48]);
		expect(intervalQuestion('m3', 'harm', () => 0.5).dir).toBe('harm');
	});
	it('chords and progressions are voiced in guitar range', () => {
		const c = chordQuestion('m7', () => 0);
		expect(c.notes.map((n) => n - c.root)).toEqual([0, 3, 7, 10, 12]);
		const v = voiceChord('C', 'IV');
		expect(v.symbol).toBe('F');
		expect(v.notes[0] % 12).toBe(5);
		const p = progressionQuestion('G', ['IV', 'V', 'vi']);
		expect(p.chords.map((x) => x.symbol)).toEqual(['G', 'C', 'D', 'Em']);
		for (const ch of p.chords) for (const n of ch.notes) expect(n).toBeGreaterThanOrEqual(40);
	});
});
