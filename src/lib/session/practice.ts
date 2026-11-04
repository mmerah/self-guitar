// The practical part of a lesson, as a session's new-skill block shows it: the goal line, the
// "How to practise this" steps and the first practice widget. Pure (the planner uses it too: a
// lesson with no widget is reading, and gets only a few minutes).
import type { Block, Inline, Lesson, LessonMeta } from '../learn/types.ts';

export type LessonPractice = {
	/** The lesson's opening sentence(s). */
	goal: Inline[] | null;
	/** The "How to practise this" list. */
	steps: Inline[][];
	/** The widget to practise with in the runner, null for reading-only lessons. */
	widget: Block | null;
};

const text = (c: Inline[]): string =>
	c.map((n) => ('v' in n ? n.v : 'c' in n ? text(n.c) : '')).join('');
export const inlineText = text;

/** Most practical first: a ladder, then changes, a strum pattern, chord diagrams, the tuner. */
function rank(b: Block): number {
	if (b.t === 'exercise') return 0;
	if (b.t === 'tool' && b.name === 'changes') return 1;
	if (b.t === 'ear' || b.t === 'fretquiz') return 2;
	if (b.t === 'strum') return 2;
	if (b.t === 'chords' || b.t === 'chord') return 3;
	if (b.t === 'tool' && b.name === 'tuner') return 4;
	if (b.t === 'fretboard') return 5;
	return 9;
}

function flat(blocks: Block[]): Block[] {
	return blocks.flatMap((b) => (b.t === 'callout' ? flat(b.blocks) : [b]));
}

/**
 * The widget that checks a fretboard-quiz or ear lesson: its own quiz (the one in the body, or
 * the check's), so the session practises what the mastery check asks rather than a side ladder.
 */
function masteryWidget(lesson: Pick<Lesson, 'mastery'>, blocks: Block[]): Block | null {
	const m = lesson.mastery;
	if (m?.type === 'fretboard')
		return (
			blocks.find((b) => b.t === 'fretquiz' && b.quiz === m.quiz) ?? {
				t: 'fretquiz',
				quiz: m.quiz,
				target: m.target
			}
		);
	if (m?.type === 'ear')
		return (
			blocks.find(
				(b) => b.t === 'ear' && b.kind === m.kind && m.set.every((i) => b.set.includes(i))
			) ?? { t: 'ear', kind: m.kind, set: m.set, dir: 'mixed', n: m.min }
		);
	return null;
}

export function lessonPractice(lesson: Lesson): LessonPractice {
	const blocks = flat(lesson.blocks);
	const first = lesson.blocks[0];
	const goal = first?.t === 'p' ? first.c : null;
	const h = lesson.blocks.findIndex((b) => b.t === 'h' && /how to practi[sc]e/i.test(text(b.c)));
	const list = h >= 0 ? lesson.blocks.slice(h + 1).find((b) => b.t !== 'p') : undefined;
	const steps = list?.t === 'list' ? list.items : [];
	let widget: Block | null = masteryWidget(lesson, blocks);
	if (!widget)
		for (const b of blocks) if (rank(b) < 9 && (!widget || rank(b) < rank(widget))) widget = b;
	return { goal, steps, widget };
}

/** Exercises a lesson embeds or checks, in lesson order. */
export function lessonExerciseIds(lesson: Pick<Lesson, 'blocks' | 'mastery'>): string[] {
	const ids = flat(lesson.blocks).flatMap((b) => (b.t === 'exercise' ? [b.id] : []));
	if (lesson.mastery?.type === 'exercise' && !ids.includes(lesson.mastery.id))
		ids.push(lesson.mastery.id);
	return ids;
}

/** Chords a lesson's body shows (diagrams, a strum's chord), as written. */
export function lessonChordNames(lesson: Pick<Lesson, 'blocks'>): string[] {
	return flat(lesson.blocks).flatMap((b) =>
		b.t === 'chord'
			? [b.id]
			: b.t === 'chords'
				? b.ids
				: b.t === 'strum' && b.chord
					? [b.chord]
					: []
	);
}

type AnyLesson = LessonMeta & { blocks?: Block[] };

/** A lesson's chords, from the index (compiled) or from its body. */
export const chordsOf = (l: AnyLesson): string[] =>
	l.chords ?? (l.blocks ? lessonChordNames(l as Lesson) : []);

/** A lesson's practice widget, from the index (compiled) or from its body. */
export const widgetOf = (l: AnyLesson): Block | null =>
	l.widget !== undefined ? l.widget : l.blocks ? lessonPractice(l as Lesson).widget : null;

/** A lesson's exercises, from the index (compiled) or from its body. */
export const exercisesOf = (l: AnyLesson): string[] =>
	l.exercises ??
	(l.blocks
		? lessonExerciseIds(l as Lesson)
		: l.mastery?.type === 'exercise'
			? [l.mastery.id]
			: []);
