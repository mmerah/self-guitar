// Spaced review (VISION §3.5): the one place that decides a skill's stored status, due date and
// interval. Pure and unit-tested; the server feeds it two kinds of events:
//   - `derive`: the status the evaluator derives from lessons/attempts/records (every write);
//   - `review`: a reviewed item was done well (😎/🙂, or a clean ladder streak at the target) or
//     badly (😖, or a miss streak).
// Rules:
//   - Mastery schedules the first review 1 day later (interval index 0). `ease` stores the index
//     into INTERVALS (1/3/7/14/30 days).
//   - While `dueAt` is set the review schedule owns the row: derivation never changes it (M3 rule).
//   - A good review of a due skill moves one interval up (capped at 30 days) and sets the next
//     due date from now; an early review changes nothing (no inflating intervals by cramming).
//   - A bad review of a due skill is a lapse: status back to `learning`, two intervals down, due
//     again tomorrow. `masteredAt` (history) is kept. Only a bad block rating (😖) or an explicit
//     review result lapses a skill (never a ladder step down).
//   - A good review of a lapsed skill, once it is due again, restores `mastered` at its
//     (shortened) interval; before its new due date nothing changes.
import type { SkillStatus } from './types.ts';

export const INTERVALS = [1, 3, 7, 14, 30] as const;
export const DAY_MS = 86_400_000;
/** Interval steps lost on a lapse. */
export const LAPSE_STEPS = 2;

export type SkillRow = {
	status: SkillStatus;
	masteredAt: number | null;
	dueAt: number | null;
	/** Index into INTERVALS. */
	ease: number | null;
};

export type SkillEvent =
	{ type: 'derive'; status: SkillStatus; masteredAt?: number } | { type: 'review'; good: boolean };

const clampEase = (e: number | null | undefined) =>
	Math.max(0, Math.min(INTERVALS.length - 1, Math.round(e ?? 0)));

export const intervalDays = (ease: number | null | undefined) => INTERVALS[clampEase(ease)];

/** Is a scheduled skill due at `now` (anything due before `dueBy`, e.g. the end of today)? */
export const isDue = (row: Pick<SkillRow, 'dueAt'> | undefined, dueBy: number) =>
	!!row?.dueAt && row.dueAt <= dueBy;

/**
 * When the item was last reviewed: the due date minus its interval (a lapsed skill is due one
 * day after its lapse).
 */
export const lastReviewed = (row: Pick<SkillRow, 'dueAt' | 'ease'> & { status?: SkillStatus }) =>
	row.dueAt === null
		? null
		: row.dueAt -
			(row.status && row.status !== 'mastered' ? INTERVALS[0] : intervalDays(row.ease)) * DAY_MS;

/**
 * The next stored row for a skill, or null when nothing changes. `dueBy` decides which skills
 * count as due for a review event (end of the learner's day).
 */
export function nextSkillState(
	prev: SkillRow | undefined,
	event: SkillEvent,
	now: number,
	dueBy = now
): SkillRow | null {
	if (event.type === 'derive') {
		// Scheduled rows belong to the review schedule.
		if (prev?.dueAt) return null;
		const { status } = event;
		if (status === 'mastered') {
			const masteredAt = prev?.masteredAt ?? event.masteredAt ?? now;
			return { status, masteredAt, ease: 0, dueAt: masteredAt + INTERVALS[0] * DAY_MS };
		}
		if (prev?.status === status || (!prev && status === 'new')) return null;
		return { status, masteredAt: prev?.masteredAt ?? null, dueAt: null, ease: null };
	}

	// A review only touches skills on the schedule that are due.
	if (!prev?.dueAt || !isDue(prev, dueBy)) return null;
	const lapsed = prev.status !== 'mastered';
	const ease = clampEase(prev.ease);
	if (event.good) {
		const next = lapsed ? ease : clampEase(ease + 1);
		return {
			status: 'mastered',
			masteredAt: prev.masteredAt ?? now,
			ease: next,
			dueAt: now + INTERVALS[next] * DAY_MS
		};
	}
	return {
		status: 'learning',
		masteredAt: prev.masteredAt,
		ease: clampEase(ease - LAPSE_STEPS),
		dueAt: now + INTERVALS[0] * DAY_MS
	};
}
