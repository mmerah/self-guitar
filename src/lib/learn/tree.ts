// Skill-tree helpers for the Learn pages: lessons per unit, level progress and soft gates.
import { isDone, nextLesson } from './evaluate';
import type { LearnIndex, LearnProgress, LessonMeta, LessonState, Level } from './types';

export { isDone };

export const stateOf = (p: LearnProgress, id: string): LessonState => p.lessons[id]?.state ?? 'new';

export function lessonsByUnit(index: LearnIndex): Map<string, LessonMeta[]> {
	const map = new Map<string, LessonMeta[]>();
	for (const l of index.lessons) map.set(l.unit, [...(map.get(l.unit) ?? []), l]);
	return map;
}

export function levelStats(level: Level, byUnit: Map<string, LessonMeta[]>, p: LearnProgress) {
	const lessons = level.units.flatMap((u) => byUnit.get(u.id) ?? []);
	return {
		total: lessons.length,
		done: lessons.filter((l) => isDone(stateOf(p, l.id))).length,
		started: lessons.filter((l) => stateOf(p, l.id) === 'started').length,
		mastered: p.masteredLevels.includes(level.id)
	};
}

/** Soft gate: the level before this one is not mastered yet (everything stays openable). */
export const gatedBy = (level: Level, p: LearnProgress): number | null =>
	level.id > 0 && !p.masteredLevels.includes(level.id - 1) ? level.id - 1 : null;

/** Where a lesson sits: its level and unit. */
export function placeOf(index: LearnIndex, lesson: LessonMeta) {
	const level = index.levels.find((l) => l.id === lesson.level)!;
	const unit = level.units.find((u) => u.id === lesson.unit)!;
	return { level, unit };
}

export const skillName = (index: LearnIndex, id: string) =>
	index.levels.flatMap((l) => l.units.flatMap((u) => u.skills)).find((s) => s.id === id)?.name ??
	id;

/** The recommended lesson: the server's pick, or (offline) the same rule on what is known. */
export function recommended(index: LearnIndex, p: LearnProgress): LessonMeta | null {
	const id = p.next?.id;
	const picked = id ? index.lessons.find((l) => l.id === id) : undefined;
	if (picked) return picked;
	const states: Record<string, LessonState> = {};
	const touched: Record<string, number> = {};
	for (const [lid, l] of Object.entries(p.lessons)) {
		states[lid] = l.state;
		if (l.touched !== undefined) touched[lid] = l.touched;
	}
	return nextLesson(index, states, touched);
}

export const MASTERY_LABEL = {
	changes: 'Chord changes',
	exercise: 'Tempo goal',
	self: 'Checklist',
	tuner: 'Tuner',
	ear: 'Ear check',
	fretboard: 'Fretboard quiz'
} as const;
