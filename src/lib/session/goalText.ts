// The weekly goal in words: always what is done, never what is missing.
import type { WeekStatus } from './goals';

export function weekLine(w: WeekStatus): string {
	if (w.met) return 'Week goal reached';
	if (w.counted === 0)
		return w.minutes > 0
			? `${w.minutes} min so far this week`
			: 'Your week starts with one session';
	return `${w.counted} of ${w.goalDays} days — every session counts`;
}
