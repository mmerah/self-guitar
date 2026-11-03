// Mastery checks, lesson states, skill status and the recommended next lesson, derived from a
// snapshot of stored data. Pure (the server gathers the snapshot), so it is unit-tested directly.
import { getChord } from '../chords/index.ts';
import { pairKey } from '../chordChanges.ts';
import type {
	LearnIndex,
	LearnProgress,
	Lesson,
	LessonState,
	LessonStatus,
	Mastery,
	MasteryProgress,
	SkillStatus
} from './types.ts';

export type ExerciseSummary = {
	/** Best clean BPM. */
	best: number | null;
	/** Highest BPM of a completed clean streak (see ExerciseStats.streakBest). */
	streakBest: number | null;
	mastered: boolean;
};

export type Snapshot = {
	lessons: Record<string, LessonStatus>;
	/** When each lesson was last opened or completed (ms since epoch). */
	touched?: Record<string, number>;
	exercises: Record<string, ExerciseSummary>;
	/** Best 1-minute-changes count per pair, keyed by pairKey(a, b) with canonical chord ids. */
	changeBest: Record<string, number>;
	/** Lessons with a confirmed self/tuner check. */
	confirmed: Set<string>;
};

export function masteryProgress(lessonId: string, m: Mastery, s: Snapshot): MasteryProgress {
	switch (m.type) {
		case 'changes': {
			const a = getChord(m.a)?.id ?? m.a;
			const b = getChord(m.b)?.id ?? m.b;
			const value = s.changeBest[pairKey(a, b)] ?? 0;
			return { done: value >= m.target, value, target: m.target };
		}
		case 'exercise': {
			// Passed by a full clean streak (cleanReps in a row) at or above the check's tempo.
			const ex = s.exercises[m.id];
			const value = ex?.best ?? 0;
			return { done: (ex?.streakBest ?? 0) >= m.bpm, value, target: m.bpm };
		}
		case 'self':
		case 'tuner':
			return { done: s.confirmed.has(lessonId) };
	}
}

/** A lesson's check is satisfied by its mastery check, or by completing it when it has none. */
export function lessonSatisfied(lesson: Lesson, s: Snapshot): boolean {
	return lesson.mastery
		? masteryProgress(lesson.id, lesson.mastery, s).done
		: s.lessons[lesson.id] === 'completed';
}

export function lessonState(lesson: Lesson, s: Snapshot): LessonState {
	const status = s.lessons[lesson.id];
	if (lesson.mastery && masteryProgress(lesson.id, lesson.mastery, s).done) return 'mastered';
	if (!lesson.mastery && status === 'completed') return 'mastered';
	return status === 'completed' ? 'completed' : status === 'started' ? 'started' : 'new';
}

/**
 * new -> learning when any lesson teaching the skill is opened; mastered when every lesson
 * teaching it has its mastery check satisfied. A skill no lesson teaches yet stays new.
 */
export function skillStatus(skillId: string, lessons: Lesson[], s: Snapshot): SkillStatus {
	const covering = lessons.filter((l) => l.skills.includes(skillId));
	if (!covering.length) return 'new';
	if (covering.every((l) => lessonSatisfied(l, s))) return 'mastered';
	return covering.some((l) => s.lessons[l.id]) ? 'learning' : 'new';
}

export const isDone = (s: LessonState | undefined) => s === 'completed' || s === 'mastered';

/**
 * The lesson to continue with (Home and Learn share it):
 * 1. the most recently started lesson that is not completed yet;
 * 2. else the first unfinished lesson at or after the furthest lesson touched (so a learner in the
 *    middle of Level 1 is never sent back to a skipped Level 0 lesson);
 * 3. else the first unfinished lesson (nothing started yet, or everything after it is done).
 */
export function nextLesson(
	index: LearnIndex,
	states: Record<string, LessonState>,
	touched: Record<string, number> = {}
): Lesson | null {
	let latest: Lesson | null = null;
	let furthest = -1;
	index.lessons.forEach((l, i) => {
		const st = states[l.id] ?? 'new';
		if (st !== 'new') furthest = i;
		// Ties (same second) go to the later lesson.
		if (st === 'started' && (!latest || (touched[l.id] ?? 0) >= (touched[latest.id] ?? 0)))
			latest = l;
	});
	if (latest) return latest;
	const open = (l: Lesson) => !isDone(states[l.id]);
	return index.lessons.slice(Math.max(0, furthest)).find(open) ?? index.lessons.find(open) ?? null;
}

export function evaluate(index: LearnIndex, s: Snapshot): LearnProgress {
	const lessons: LearnProgress['lessons'] = {};
	const states: Record<string, LessonState> = {};
	for (const l of index.lessons) {
		states[l.id] = lessonState(l, s);
		lessons[l.id] = {
			state: states[l.id],
			mastery: l.mastery ? masteryProgress(l.id, l.mastery, s) : null,
			...(s.touched?.[l.id] !== undefined && { touched: s.touched[l.id] })
		};
	}
	const skills: Record<string, SkillStatus> = {};
	for (const level of index.levels)
		for (const unit of level.units)
			for (const skill of unit.skills) skills[skill.id] = skillStatus(skill.id, index.lessons, s);

	const masteredLevels = index.levels
		.filter(
			(lv) =>
				lv.units.length && lv.units.every((u) => u.skills.every((k) => skills[k.id] === 'mastered'))
		)
		.map((lv) => lv.id);
	const next = nextLesson(index, states, s.touched);
	return {
		lessons,
		skills,
		exercises: {},
		masteredLevels,
		next: next && { id: next.id, title: next.title, level: next.level }
	};
}
