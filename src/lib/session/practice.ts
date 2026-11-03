// The practical part of a lesson, as a session's new-skill block shows it: the goal line, the
// "How to practise this" steps and the first practice widget. Pure (the planner uses it too: a
// lesson with no widget is reading, and gets only a few minutes).
import type { Block, Inline, Lesson } from '../learn/types.ts';

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

/** Most practical first: a ladder, then changes, a strum pattern, chord diagrams, the tuner. */
function rank(b: Block): number {
	if (b.t === 'exercise') return 0;
	if (b.t === 'tool' && b.name === 'changes') return 1;
	if (b.t === 'strum') return 2;
	if (b.t === 'chords' || b.t === 'chord') return 3;
	if (b.t === 'tool' && b.name === 'tuner') return 4;
	return 9;
}

function flat(blocks: Block[]): Block[] {
	return blocks.flatMap((b) => (b.t === 'callout' ? flat(b.blocks) : [b]));
}

export function lessonPractice(lesson: Lesson): LessonPractice {
	const blocks = flat(lesson.blocks);
	const first = lesson.blocks[0];
	const goal = first?.t === 'p' ? first.c : null;
	const h = lesson.blocks.findIndex((b) => b.t === 'h' && /how to practi[sc]e/i.test(text(b.c)));
	const list = h >= 0 ? lesson.blocks.slice(h + 1).find((b) => b.t !== 'p') : undefined;
	const steps = list?.t === 'list' ? list.items : [];
	let widget: Block | null = null;
	for (const b of blocks) if (rank(b) < 9 && (!widget || rank(b) < rank(widget))) widget = b;
	return { goal, steps, widget };
}
