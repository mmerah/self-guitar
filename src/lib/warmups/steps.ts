// Warm-up routine helpers shared by the content build, the planner and the player (browser-safe).
import type { Warmup, WarmupGoal, WarmupStep } from '../content/schema.ts';

export const GOAL_LABEL: Record<WarmupGoal, string> = {
	stretch: 'Stretch',
	independence: 'Finger independence',
	chromatic: 'Chromatic',
	changes: 'Chord changes',
	strumming: 'Strumming groove',
	fingerpicking: 'Fingerpicking',
	legato: 'Hammer-ons & pull-offs',
	muting: 'Muting',
	pentatonic: 'Pentatonic (Level 5)'
};

export type StepKind = 'exercise' | 'atex' | 'strum' | 'timer';

export const stepKind = (s: WarmupStep): StepKind =>
	'exercise' in s ? 'exercise' : 'atex' in s ? 'atex' : 'timer' in s ? 'timer' : 'strum';

/**
 * Seconds each step gets: its own `seconds`/`timer`, else an even share of what is left. With
 * `minutes` (a session's warm-up slot shorter than the routine) every step is trimmed to fit.
 */
export function stepSeconds(w: Pick<Warmup, 'minutes' | 'steps'>, minutes?: number): number[] {
	const fixed = w.steps.map((s) => ('timer' in s ? s.timer : (s.seconds ?? null)));
	const left = Math.max(0, w.minutes * 60 - fixed.reduce<number>((a, s) => a + (s ?? 0), 0));
	const open = fixed.filter((s) => s === null).length;
	const out = fixed.map((s) => s ?? Math.max(20, Math.round(left / open / 5) * 5));
	const sum = out.reduce((a, x) => a + x, 0);
	if (!minutes || minutes * 60 >= sum) return out;
	const k = (minutes * 60) / sum;
	return out.map((x) => Math.max(10, Math.round((x * k) / 5) * 5));
}

/** Exercises a routine plays (its ladders): the skills they train count as reviewed. */
export const warmupExercises = (w: Warmup) =>
	w.steps.flatMap((s) => ('exercise' in s ? [s.exercise] : []));
