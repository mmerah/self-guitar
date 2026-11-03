import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadLearn } from '../../src/lib/content/learn';
import { warmupMetaSchema, WARMUP_GOALS } from '../../src/lib/content/schema';
import { stepKind, stepSeconds } from '../../src/lib/warmups/steps';

const ok = {
	id: 'test-routine',
	title: 'Test routine',
	goal: 'stretch',
	level: 1,
	minutes: 3,
	howTo: ['Do the thing.'],
	steps: [{ timer: 30, text: 'Shake out.' }]
};

describe('warm-up schema', () => {
	it('accepts the four step kinds', () => {
		const w = warmupMetaSchema.parse({
			...ok,
			startBpm: 50,
			targetBpm: 80,
			steps: [
				{ timer: 30, text: 'Shake out.' },
				{ exercise: 'chromatic-warm-up' },
				{
					atex: '\\tempo 60\n:4 0.1 0.1 0.1 0.1',
					chords: ['G 3-2-0-0-3-3'],
					strum: 'D - D - D - D -'
				},
				{ strum: 'D - D U', bpm: 60, chord: 'G', seconds: 60 }
			]
		});
		expect(w.steps.map(stepKind)).toEqual(['timer', 'exercise', 'atex', 'strum']);
		expect(w.tags).toEqual([]);
	});

	it('is strict: length, unknown keys, tempo pairs, step shapes', () => {
		const bad = (over: object) => warmupMetaSchema.safeParse({ ...ok, ...over }).success;
		expect(bad({})).toBe(true);
		expect(bad({ minutes: 6 })).toBe(false);
		expect(bad({ minutes: 1 })).toBe(false);
		expect(bad({ goal: 'speed' })).toBe(false);
		expect(bad({ notes: 'x' })).toBe(false);
		expect(bad({ startBpm: 60 })).toBe(false);
		expect(bad({ startBpm: 90, targetBpm: 80 })).toBe(false);
		expect(bad({ steps: [] })).toBe(false);
		expect(bad({ steps: [{ timer: 30 }] })).toBe(false); // a stretch says what to do
		expect(bad({ steps: [{ exercise: 'x', bpm: 60 }] })).toBe(false);
		expect(bad({ howTo: ['a', 'b', 'c', 'd'] })).toBe(false);
	});

	it('shares the routine time between steps without a time of their own', () => {
		expect(
			stepSeconds({
				minutes: 3,
				steps: [{ timer: 60, text: 'x x x' }, { exercise: 'a' }, { exercise: 'b' }]
			})
		).toEqual([60, 60, 60]);
		expect(
			stepSeconds({
				minutes: 2,
				steps: [{ strum: 'D - D -', bpm: 60, seconds: 90 }, { exercise: 'a' }]
			})
		).toEqual([90, 30]);
	});
});

describe('the warm-up routines', () => {
	const { index, errors } = loadLearn(path.resolve(__dirname, '../../content'));

	it('load without errors: 26 from the research plus the first warm-up', () => {
		expect(errors).toEqual([]);
		expect(index.warmups.length).toBeGreaterThanOrEqual(27);
		expect(new Set(index.warmups.map((w) => w.goal))).toEqual(new Set(WARMUP_GOALS));
	});

	it('keep pentatonic routines for Level 5, and fit their minutes', () => {
		for (const w of index.warmups) {
			if (w.goal === 'pentatonic') expect(w.level, w.id).toBe(5);
			else expect(w.level, w.id).toBeLessThanOrEqual(3);
			const total = stepSeconds(w).reduce((a, b) => a + b, 0);
			expect(total, w.id).toBeLessThanOrEqual(w.minutes * 60 + 30);
		}
		// Something for every learner from day one.
		expect(index.warmups.some((w) => w.level === 0)).toBe(true);
	});
});
