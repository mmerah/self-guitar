// Planner states for the four scenarios (new user, Level 0 done, mid-Level 1, all mastered),
// built from the real curriculum: shared by the planner tests.
import fs from 'node:fs';
import { DAY_MS } from '../../src/lib/learn/review';
import type { LearnIndex, LessonState } from '../../src/lib/learn/types';
import type { ExerciseSignal, PlanState, SongSignal } from '../../src/lib/session/planner';

const content = JSON.parse(fs.readFileSync('generated/content.json', 'utf8')) as {
	learn: LearnIndex;
	songs: { id: string; title: string; level: number; bars: number; pickup: boolean }[];
};
export const index = content.learn;
export const songs: SongSignal[] = content.songs.map((s) => ({
	id: s.id,
	title: s.title,
	level: s.level,
	bars: s.bars,
	pickup: s.pickup,
	lastPlayedAt: null,
	maxTempoPct: null,
	loop: null
}));

export const NOW = Date.UTC(2026, 10, 3, 9);
export const DATE = '2026-11-03';

export function base(over: Partial<PlanState> = {}): PlanState {
	return {
		minutes: 15,
		date: DATE,
		now: NOW,
		dueBy: NOW + 12 * 3600_000,
		index,
		lessonStates: {},
		next: index.lessons[0].id,
		skills: [],
		exercises: {},
		pairs: [],
		songs,
		recent: [],
		...over
	};
}

export const sig = (over: Partial<ExerciseSignal> = {}): ExerciseSignal => ({
	attempts: 10,
	mastered: false,
	best: 50,
	ladderBpm: 54,
	recentClean: 8,
	recentTotal: 10,
	stalled: false,
	lastAt: NOW - DAY_MS,
	...over
});

const mastered = (level: (l: number) => boolean) => {
	const states: Record<string, LessonState> = {};
	for (const l of index.lessons) if (level(l.level)) states[l.id] = 'mastered';
	return states;
};
const masteredExercises = (states: Record<string, LessonState>) => {
	const out: Record<string, ExerciseSignal> = {};
	for (const l of index.lessons)
		if (states[l.id] === 'mastered' && l.mastery?.type === 'exercise')
			out[l.mastery.id] = sig({ mastered: true, recentClean: 4, recentTotal: 4, ladderBpm: 70 });
	return out;
};
const masteredSkills = (states: Record<string, LessonState>, dueAt: number) =>
	[
		...new Set(index.lessons.filter((l) => states[l.id] === 'mastered').flatMap((l) => l.skills))
	].map((id) => ({ id, status: 'mastered' as const, dueAt, ease: 1 }));

/** (a) A brand-new learner. */
export const scenarioA = (over: Partial<PlanState> = {}) => base(over);

/** (b) Level 0 just mastered (yesterday's session), next: the first Level 1 lesson. */
export function scenarioB(over: Partial<PlanState> = {}): PlanState {
	const states = mastered((l) => l === 0);
	return base({
		lessonStates: states,
		next: index.lessons.find((l) => l.level === 1)!.id,
		exercises: masteredExercises(states),
		skills: masteredSkills(states, NOW + DAY_MS),
		recent: [{ date: '2026-11-02', blocks: [] }],
		...over
	});
}

/** (c) Mid-Level 1: Level 0 done, the first two L1 lessons done, the third started. */
export function scenarioC(over: Partial<PlanState> = {}): PlanState {
	const states = mastered((l) => l === 0);
	const l1 = index.lessons.filter((l) => l.level === 1);
	states[l1[0].id] = 'mastered';
	states[l1[1].id] = 'completed';
	states[l1[2].id] = 'started';
	return base({
		lessonStates: states,
		next: l1[2].id,
		exercises: {
			...masteredExercises(states),
			'em-e-quarters': sig({ recentClean: 3, recentTotal: 10, ladderBpm: 54 }),
			'am-em-e-quarters': sig({ stalled: true, ladderBpm: 50 })
		},
		pairs: [
			{ a: 'E', b: 'Em', best: 34, lastAt: NOW - 2 * DAY_MS },
			{ a: 'Am', b: 'Em', best: 18, lastAt: NOW - DAY_MS }
		],
		skills: [
			{ id: 'first-strum', status: 'mastered' as const, dueAt: NOW - DAY_MS, ease: 1 },
			{ id: 'read-tab', status: 'mastered' as const, dueAt: NOW - DAY_MS, ease: 1 },
			...masteredSkills(states, NOW + 3 * DAY_MS).filter(
				(x) => x.id !== 'first-strum' && x.id !== 'read-tab'
			)
		],
		recent: [{ date: '2026-11-02', blocks: [] }],
		...over
	});
}

/** (d) Every lesson of Levels 0–3 mastered, nothing due yet. */
export function scenarioD(over: Partial<PlanState> = {}): PlanState {
	const states = mastered(() => true);
	return base({
		lessonStates: states,
		next: null,
		exercises: masteredExercises(states),
		pairs: index.lessons.flatMap((l) =>
			l.mastery?.type === 'changes'
				? [{ a: l.mastery.a, b: l.mastery.b, best: l.mastery.target, lastAt: NOW - 3 * DAY_MS }]
				: []
		),
		skills: masteredSkills(states, NOW + 5 * DAY_MS),
		recent: [{ date: '2026-11-02', blocks: [] }],
		...over
	});
}
