// The curriculum split for loading: the small index every page and rule uses, and per-lesson /
// per-exercise payloads (bodies and scores) fetched when one is opened. Pure (the content build
// writes the demo's files with it; the server serves the same shapes).
import type {
	Exercise,
	ExerciseMeta,
	LearnContent,
	LearnIndex,
	Lesson,
	LessonMeta,
	LessonPayload
} from './types.ts';

/** The index form of the curriculum: no lesson bodies, no exercise scores. */
export function learnIndexOf(learn: LearnContent | LearnIndex): LearnIndex {
	return {
		...learn,
		lessons: learn.lessons.map((l) => {
			const { blocks: _blocks, ...meta } = l as Partial<Lesson>;
			return meta as LessonMeta;
		}),
		exercises: learn.exercises.map((e) => {
			const { tex: _tex, ...meta } = e as Partial<Exercise>;
			return meta as ExerciseMeta;
		})
	};
}

/** A lesson's payload from the full content: its body and the exercises it shows. */
export function lessonPayload(learn: LearnContent, id: string): LessonPayload | undefined {
	const lesson = learn.lessons.find((l) => l.id === id);
	if (!lesson) return undefined;
	const ids = new Set(lesson.exercises ?? []);
	return { lesson, exercises: learn.exercises.filter((e) => ids.has(e.id)) };
}
