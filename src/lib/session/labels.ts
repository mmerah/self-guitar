// Block kinds and the one-line "what to do" of a block, as shown in the plan and the runner.
import type { IconName } from '$lib/components/Icon.svelte';
import type { Inline, LearnIndex } from '$lib/learn/types';
import { lessonPractice } from './practice';
import type { BlockKind, PlanBlock } from './types';

export const KIND: Record<BlockKind, { label: string; icon: IconName }> = {
	warmup: { label: 'Warm-up', icon: 'timer' },
	technique: { label: 'Technique', icon: 'metronome' },
	new: { label: 'New skill', icon: 'learn' },
	review: { label: 'Review', icon: 'loop' },
	song: { label: 'Song', icon: 'play' }
};

/** "in 3 days" / "tomorrow" for a due date. */
export function dueIn(dueAt: number, now = Date.now()): string {
	const d = Math.round((dueAt - now) / 86_400_000);
	return d <= 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`;
}

const plain = (c: Inline[]): string =>
	c.map((n) => ('v' in n ? n.v : 'c' in n ? plain(n.c) : '')).join('');

/** What to do in this block, in one or two short sentences (the top of the runner). */
export function whatToDo(b: PlanBlock, index: LearnIndex): string {
	const t = b.target;
	switch (t.type) {
		case 'exercise': {
			const n = index.exercises.find((e) => e.id === t.id)?.cleanReps ?? 3;
			return `Loop it and rate every pass: Clean or Miss. ${n} clean in a row move the tempo up.`;
		}
		case 'changes':
			return `Switch ${t.a} ⇄ ${t.b} for one minute and count every change.`;
		case 'song':
			return `Play along at ${t.tempoPct}%${t.loop ? ' on the loop' : ''}. Keep going through mistakes.`;
		case 'strum':
			return `Strum the pattern with the click${t.chord ? ` on ${t.chord}` : ''}. Keep the hand moving.`;
		case 'tool':
			return t.id === 'tuner'
				? 'Tune all six strings with the tuner, then come back.'
				: `One down-strum per click at ${t.params.bpm ?? 60} BPM. Lock in with the beat.`;
		case 'lesson': {
			const l = index.lessons.find((x) => x.id === t.id);
			const goal = l && lessonPractice(l).goal;
			return goal ? plain(goal) : 'Work through the lesson at your own pace.';
		}
	}
}
