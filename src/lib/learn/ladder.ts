// Tempo ladder for exercises: play the loop, rate it clean or missed. Pure, unit-tested, and run
// on both sides: the page rates optimistically, the server replays the same rules to store where
// the ladder stands (so a reload resumes exactly there).
//   - `cleanReps` clean passes in a row at a tempo move up `step` BPM (capped at the target).
//   - A miss resets the clean streak; a second miss in a row drops one step (never below start).
//   - Mastered: `cleanReps` clean passes in a row at the target tempo.
import type { ExerciseMeta } from './types.ts';

export type LadderConfig = Pick<ExerciseMeta, 'startBpm' | 'targetBpm' | 'step' | 'cleanReps'>;

export type LadderState = {
	bpm: number;
	/** Clean passes in a row at the current BPM. */
	streak: number;
	/** Misses in a row at the current BPM (two drop a step). */
	misses: number;
};

/** clean: streak +1 · up: moved up a step · miss: streak reset · down: dropped a step. */
export type LadderEvent = 'clean' | 'up' | 'miss' | 'down' | 'mastered';

/** Misses in a row that drop the ladder one step. */
export const MISSES_TO_DROP = 2;

/** `\tempo 70` in an alphaTex score (content:check requires one in every exercise). */
export const TEMPO_RE = /\\tempo\s+(\d+)/;

/** Keeps a BPM on the ladder: startBpm..targetBpm. */
export const clampLadder = (cfg: LadderConfig, bpm: number) =>
	Math.min(cfg.targetBpm, Math.max(cfg.startBpm, bpm));

/** Where a session starts: where the ladder was left (within the ladder), else startBpm. */
export function ladderStart(cfg: LadderConfig, resume?: Partial<LadderState> | null): LadderState {
	return {
		bpm: clampLadder(cfg, resume?.bpm ?? cfg.startBpm),
		streak: Math.max(0, Math.min(cfg.cleanReps - 1, resume?.streak ?? 0)),
		misses: Math.max(0, Math.min(MISSES_TO_DROP - 1, resume?.misses ?? 0))
	};
}

/** Applies one rating; returns the next state and what happened (for feedback). */
export function ladderRate(
	cfg: LadderConfig,
	s: LadderState,
	clean: boolean
): { state: LadderState; event: LadderEvent } {
	if (!clean) {
		const misses = s.misses + 1;
		if (misses >= MISSES_TO_DROP && s.bpm > cfg.startBpm) {
			const bpm = clampLadder(cfg, s.bpm - cfg.step);
			return { state: { bpm, streak: 0, misses: 0 }, event: 'down' };
		}
		return {
			state: { bpm: s.bpm, streak: 0, misses: Math.min(misses, MISSES_TO_DROP - 1) },
			event: 'miss'
		};
	}
	const streak = s.streak + 1;
	if (streak < cfg.cleanReps) return { state: { ...s, streak, misses: 0 }, event: 'clean' };
	if (s.bpm >= cfg.targetBpm) {
		// A full streak at the target: mastered. Start counting again (it can be repeated).
		return { state: { bpm: s.bpm, streak: 0, misses: 0 }, event: 'mastered' };
	}
	const bpm = clampLadder(cfg, s.bpm + cfg.step);
	return { state: { bpm, streak: 0, misses: 0 }, event: 'up' };
}

/** Attempts are accepted from a little below the start (old content) to a little above target. */
export const attemptRange = (cfg: LadderConfig) => ({
	min: cfg.startBpm - 3 * cfg.step,
	max: cfg.targetBpm + 2 * cfg.step
});

/** Position of a BPM between start (0%) and target (100%) of the ladder, clamped. */
export function ladderPct(cfg: LadderConfig, bpm: number | null | undefined): number {
	if (bpm === null || bpm === undefined) return 0;
	const span = cfg.targetBpm - cfg.startBpm;
	if (span <= 0) return bpm >= cfg.targetBpm ? 100 : 0;
	return Math.max(0, Math.min(100, ((bpm - cfg.startBpm) / span) * 100));
}

/** The `\tempo` written in an exercise score; 120 otherwise. */
export function scoreTempo(tex: string): number {
	const m = TEMPO_RE.exec(tex);
	return m ? Number(m[1]) : 120;
}
