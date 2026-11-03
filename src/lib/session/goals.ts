// Weekly goal (VISION §3.1): "N days × M minutes a week" instead of a daily streak. Pure.
//   - A day counts when it has at least `dailyMin` minutes of session practice (a session of the
//     goal length that ran a minute short still counts: 10% grace, rounded down).
//   - The ring fills with counted days; partial days still show as minutes, never as a loss.
//   - Streak = weeks in a row with the goal met, counted back to the week of the first session
//     (never further). One freeze per week: a finished week one day short still counts (the
//     freeze is used automatically), but only a week with some practice in it. The current week
//     adds to the streak once its goal is met, and never breaks it while it is in progress.
// Weeks start on Monday. Dates are local days, YYYY-MM-DD.
import { addDays } from './time.ts';
import type { Settings } from './types.ts';

export { addDays };
export const FREEZES_PER_WEEK = 1;

/** Monday of the date's week. */
export function weekStart(date: string): string {
	const [y, m, d] = date.split('-').map(Number);
	const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Monday = 0
	return addDays(date, -dow);
}

/** Minutes that make a day count: the daily goal with 10% grace (rounded down). */
export const enoughMinutes = (dailyMin: number) => dailyMin - Math.floor(dailyMin * 0.1);
export const countsAsDay = (minutes: number, dailyMin: number) =>
	minutes > 0 && minutes >= enoughMinutes(dailyMin);

export type DayStat = { date: string; minutes: number; counted: boolean };

export type WeekStatus = {
	start: string;
	days: DayStat[];
	/** Days that reached the daily minutes. */
	counted: number;
	minutes: number;
	goalDays: number;
	dailyMin: number;
	/** Ring fill, 0..1 (counted days / goal days). */
	progress: number;
	met: boolean;
	/** Met thanks to the week's freeze (finished weeks only). */
	frozen: boolean;
	finished: boolean;
};

export function weekStatus(
	minutesByDay: Record<string, number>,
	start: string,
	today: string,
	s: Pick<Settings, 'weeklyDays' | 'dailyMin'>
): WeekStatus {
	const days = Array.from({ length: 7 }, (_, i) => {
		const date = addDays(start, i);
		const minutes = minutesByDay[date] ?? 0;
		return { date, minutes, counted: countsAsDay(minutes, s.dailyMin) };
	});
	const counted = days.filter((d) => d.counted).length;
	const minutes = days.reduce((a, d) => a + d.minutes, 0);
	const finished = addDays(start, 6) < today;
	const metOutright = counted >= s.weeklyDays;
	// The freeze covers a short week, not an empty one.
	const frozen =
		finished && !metOutright && minutes > 0 && counted + FREEZES_PER_WEEK >= s.weeklyDays;
	return {
		start,
		days,
		counted,
		minutes,
		goalDays: s.weeklyDays,
		dailyMin: s.dailyMin,
		progress: Math.min(1, counted / s.weeklyDays),
		met: metOutright || frozen,
		frozen,
		finished
	};
}

export type Goals = {
	week: WeekStatus;
	/** Weeks in a row with the goal met (this week included once met). */
	streak: number;
	/** Last week did not need its freeze (the ring says when one was used). */
	freezeLeft: boolean;
};

/** `firstDate`: the day of the first session (null: none yet); the streak never goes back further. */
export function weeklyGoals(
	minutesByDay: Record<string, number>,
	today: string,
	s: Pick<Settings, 'weeklyDays' | 'dailyMin'>,
	firstDate: string | null = null
): Goals {
	const start = weekStart(today);
	const week = weekStatus(minutesByDay, start, today, s);
	let streak = week.met ? 1 : 0;
	const first = firstDate ? weekStart(firstDate) : start;
	for (let w = addDays(start, -7); w >= first; w = addDays(w, -7)) {
		if (!weekStatus(minutesByDay, w, today, s).met) break;
		streak++;
	}
	const last = weekStatus(minutesByDay, addDays(start, -7), today, s);
	return { week, streak, freezeLeft: !last.frozen };
}
