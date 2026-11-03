import { describe, expect, it } from 'vitest';
import {
	DAY_MS,
	INTERVALS,
	lastReviewed,
	nextSkillState,
	type SkillRow
} from '../../src/lib/learn/review';
import { addDays, weekStart, weeklyGoals, weekStatus } from '../../src/lib/session/goals';

const NOW = Date.UTC(2026, 10, 3, 9);
const mastered = (ease: number, dueAt: number, masteredAt = NOW - 30 * DAY_MS): SkillRow => ({
	status: 'mastered',
	masteredAt,
	dueAt,
	ease
});

describe('spaced review', () => {
	it('mastery schedules the first review a day later', () => {
		const at = NOW - 3600_000;
		expect(
			nextSkillState(undefined, { type: 'derive', status: 'mastered', masteredAt: at }, NOW)
		).toEqual({
			status: 'mastered',
			masteredAt: at,
			ease: 0,
			dueAt: at + DAY_MS
		});
		// An M3 row mastered without a schedule gets one, keeping its mastered_at.
		const old: SkillRow = { status: 'mastered', masteredAt: at - DAY_MS, dueAt: null, ease: null };
		expect(nextSkillState(old, { type: 'derive', status: 'mastered' }, NOW)?.dueAt).toBe(at);
	});

	it('derivation keeps M3 behaviour and never touches a scheduled row', () => {
		expect(nextSkillState(undefined, { type: 'derive', status: 'new' }, NOW)).toBeNull();
		expect(nextSkillState(undefined, { type: 'derive', status: 'learning' }, NOW)).toEqual({
			status: 'learning',
			masteredAt: null,
			dueAt: null,
			ease: null
		});
		const row = mastered(2, NOW + DAY_MS);
		expect(nextSkillState(row, { type: 'derive', status: 'learning' }, NOW)).toBeNull();
		const lapsed: SkillRow = { ...row, status: 'learning' };
		expect(nextSkillState(lapsed, { type: 'derive', status: 'mastered' }, NOW)).toBeNull();
	});

	it('good reviews of due skills walk the intervals 1 → 3 → 7 → 14 → 30 (capped)', () => {
		let row = mastered(0, NOW);
		const seen: number[] = [];
		let now = NOW;
		for (let i = 0; i < 6; i++) {
			row = nextSkillState(row, { type: 'review', good: true }, now)!;
			seen.push(Math.round((row.dueAt! - now) / DAY_MS));
			now = row.dueAt!;
		}
		expect(seen).toEqual([3, 7, 14, 30, 30, 30]);
		expect(row.status).toBe('mastered');
		expect(INTERVALS).toEqual([1, 3, 7, 14, 30]);
	});

	it('an early review changes nothing; due-by covers the rest of the day', () => {
		const row = mastered(1, NOW + 6 * 3600_000);
		expect(nextSkillState(row, { type: 'review', good: true }, NOW)).toBeNull();
		expect(nextSkillState(row, { type: 'review', good: false }, NOW)).toBeNull();
		expect(
			nextSkillState(row, { type: 'review', good: true }, NOW, NOW + 12 * 3600_000)?.ease
		).toBe(2);
		// Never-scheduled skills (new / learning) are not reviewed.
		expect(nextSkillState(undefined, { type: 'review', good: true }, NOW)).toBeNull();
		expect(
			nextSkillState(
				{ status: 'learning', masteredAt: null, dueAt: null, ease: null },
				{ type: 'review', good: false },
				NOW
			)
		).toBeNull();
	});

	it('a lapse shortens the interval, sets learning and keeps mastered_at; a good review restores it', () => {
		const since = NOW - 40 * DAY_MS;
		const row = mastered(3, NOW - DAY_MS, since);
		const lapsed = nextSkillState(row, { type: 'review', good: false }, NOW)!;
		expect(lapsed).toEqual({ status: 'learning', masteredAt: since, ease: 1, dueAt: NOW + DAY_MS });
		// Not restored before its new due date (a good pass the same day changes nothing)...
		expect(nextSkillState(lapsed, { type: 'review', good: true }, NOW + 3600_000)).toBeNull();
		expect(nextSkillState(lapsed, { type: 'review', good: false }, NOW + 3600_000)).toBeNull();
		// ...then it comes back at the shortened interval.
		const later = NOW + DAY_MS + 3600_000;
		const back = nextSkillState(lapsed, { type: 'review', good: true }, later)!;
		expect(back).toEqual({
			status: 'mastered',
			masteredAt: since,
			ease: 1,
			dueAt: later + 3 * DAY_MS
		});
		// A lapse at the first interval stays at the first interval.
		expect(nextSkillState(mastered(0, NOW), { type: 'review', good: false }, NOW)!.ease).toBe(0);
	});

	it('last practised = due date minus the interval', () => {
		expect(lastReviewed(mastered(2, NOW))).toBe(NOW - 7 * DAY_MS);
		expect(lastReviewed({ dueAt: null, ease: null })).toBeNull();
		// A lapsed skill is due one day after the lapse.
		expect(lastReviewed({ status: 'learning', dueAt: NOW, ease: 2 })).toBe(NOW - DAY_MS);
	});
});

describe('weekly goal', () => {
	const goal = { weeklyDays: 5, dailyMin: 15 };

	it('weeks start on Monday', () => {
		expect(weekStart('2026-11-03')).toBe('2026-11-02'); // Tuesday → Monday
		expect(weekStart('2026-11-08')).toBe('2026-11-02'); // Sunday
		expect(weekStart('2026-11-02')).toBe('2026-11-02');
		expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
		expect(addDays('2026-03-29', 1)).toBe('2026-03-30'); // across a DST change
	});

	it('counts days that reach the daily minutes; partial days still add minutes', () => {
		const w = weekStatus(
			{ '2026-11-02': 14, '2026-11-03': 10, '2026-11-04': 20 },
			'2026-11-02',
			'2026-11-04',
			goal
		);
		expect(w.counted).toBe(2);
		expect(w.minutes).toBe(44); // 14 of 15 counts (a minute's grace); 10 does not
		expect(w.progress).toBeCloseTo(0.4);
		expect(w.met).toBe(false);
		expect(w.finished).toBe(false);
		expect(w.frozen).toBe(false);
	});

	it('one freeze per finished week covers a single missing day', () => {
		const days = (start: string, n: number) =>
			Object.fromEntries(Array.from({ length: n }, (_, i) => [addDays(start, i), 20]));
		const byDay = {
			...days('2026-10-12', 5), // met
			...days('2026-10-19', 4), // one short: frozen
			...days('2026-10-26', 5), // met
			...days('2026-11-02', 2) // this week, in progress
		};
		const g = weeklyGoals(byDay, '2026-11-04', goal, '2026-10-12');
		expect(g.week.counted).toBe(2);
		expect(g.week.met).toBe(false);
		expect(g.streak).toBe(3); // the in-progress week never breaks it
		expect(g.freezeLeft).toBe(true);
		expect(weekStatus(byDay, '2026-10-19', '2026-11-04', goal)).toMatchObject({
			met: true,
			frozen: true
		});

		// Two days short breaks the streak.
		const broken = weeklyGoals(
			{ ...byDay, ...{}, '2026-10-29': 0, '2026-10-30': 0 },
			'2026-11-04',
			goal,
			'2026-10-12'
		);
		expect(broken.streak).toBe(0);

		// Meeting this week's goal adds it.
		const met = weeklyGoals(
			{ ...byDay, ...days('2026-11-02', 5) },
			'2026-11-08',
			goal,
			'2026-10-12'
		);
		expect(met.week.met).toBe(true);
		expect(met.streak).toBe(4);
		expect(met.week.progress).toBe(1);
	});

	it('weeklyDays = 1: the streak stops at empty weeks and at the first session', () => {
		const one = { weeklyDays: 1, dailyMin: 15 };
		// No practice at all: no streak (a freeze never covers an empty week).
		expect(weeklyGoals({}, '2026-11-04', one, null).streak).toBe(0);
		expect(weeklyGoals({}, '2026-11-04', one, '2026-06-01').streak).toBe(0);
		// One short day last week is covered by the freeze; the empty week before breaks it.
		const g = weeklyGoals(
			{ '2026-10-27': 5, '2026-10-13': 20, '2026-11-03': 20 },
			'2026-11-04',
			one,
			'2026-10-13'
		);
		expect(g.streak).toBe(2);
		expect(g.freezeLeft).toBe(false);
		// Every week met: counted back to the first session's week only.
		const all = Object.fromEntries(
			Array.from({ length: 300 }, (_, i) => [addDays('2026-11-04', -7 * i), 20])
		);
		expect(weeklyGoals(all, '2026-11-04', one, '2026-09-30').streak).toBe(6);
	});
});
