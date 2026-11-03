// Block kinds and the one-line "what to do" of a block, as shown in the plan and the runner.
import type { IconName } from '$lib/components/Icon.svelte';
import { getChord } from '$lib/chords';
import type { Inline, LearnIndex } from '$lib/learn/types';
import { lessonPractice } from './practice';
import type { BlockKind, PlanBlock, SongPlay } from './types';

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

/** Fingers that stay on the same string and fret from the first chord to the second. */
export function anchorFingers(a: string, b: string): number[] {
	const va = getChord(a)?.voicings[0];
	const vb = getChord(b)?.voicings[0];
	if (!va || !vb) return [];
	const out: number[] = [];
	va.frets.forEach((f, i) => {
		const finger = va.fingers[i];
		if (f && finger && vb.frets[i] === f && vb.fingers[i] === finger) out.push(finger);
	});
	return [...new Set(out)].sort();
}

/** "Switch C ↔ Am as many times as you can in 1 minute. Keep finger 1 down." */
export function changesDo(a: string, b: string): string {
	const keep = anchorFingers(a, b);
	const tip = keep.length
		? ` Keep finger${keep.length > 1 ? 's' : ''} ${keep.join(' and ')} down.`
		: ' Move all fingers together, as one shape.';
	return `Switch ${a} ↔ ${b} as many times as you can in 1 minute.${tip}`;
}

const SONG_DO: Record<SongPlay, string> = {
	melody: 'Pick the melody, one note at a time',
	chords: 'Strum the chords written above the tab',
	fingerstyle: 'Fingerpick: thumb on the bass, fingers on the thin strings'
};

/** What to do in this block, in one or two short sentences (the top of the runner). */
export function whatToDo(b: PlanBlock, index: LearnIndex): string {
	const t = b.target;
	switch (t.type) {
		case 'exercise': {
			const n = index.exercises.find((e) => e.id === t.id)?.cleanReps ?? 3;
			return `Loop it and rate every pass: Clean or Miss. ${n} clean in a row move the tempo up.`;
		}
		case 'changes':
			return changesDo(t.a, t.b);
		case 'song':
			return `${SONG_DO[t.play ?? 'melody']}, at ${t.tempoPct}% speed${t.loop ? ', on the loop' : ''}. Keep going through mistakes.`;
		case 'strum':
			return `Strum the pattern with the click${t.chord ? ` on ${t.chord}` : ''}. Keep the hand moving.`;
		case 'tool':
			return t.id === 'tuner'
				? 'Tap Start tuner, pick one string at a time and turn its peg until it says In tune.'
				: `One down-strum per click at ${t.params.bpm ?? 60} BPM. Lock in with the beat.`;
		case 'lesson': {
			const l = index.lessons.find((x) => x.id === t.id);
			if (!l) return 'Work through the lesson at your own pace.';
			const p = lessonPractice(l);
			const w = p.widget;
			if (w?.t === 'tool' && w.name === 'changes') {
				const a = getChord(w.params.a ?? '')?.id;
				const bb = getChord(w.params.b ?? '')?.id;
				if (a && bb) return changesDo(a, bb);
			}
			if (w?.t === 'tool' && w.name === 'tuner')
				return 'Tap Start tuner, pick one string at a time and turn its peg until it says In tune.';
			if (w?.t === 'strum')
				return `Strum the pattern with the click${w.chord ? ` on ${w.chord}` : ''}. Keep the hand moving.`;
			if (w?.t === 'chords' || w?.t === 'chord')
				return 'Finger each shape, strum once, and check every string rings. Tap a diagram to hear it.';
			if (p.steps.length) return 'Guitar in hand: work through the steps below.';
			return p.goal ? plain(p.goal) : 'Work through the lesson at your own pace.';
		}
	}
}
