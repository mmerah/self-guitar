// "Find the note" quizzes on the fretboard (pure): which notes a round asks, where they are, and
// whether a round passes. Positions count in frets 0–11; fret 12 counts as the open string.
import { FRETS, midiAt } from '../theory/fretboard.ts';
import { NATURALS, isNoteName, pcOf } from '../theory/notes.ts';

/** string-6 … string-1, strings-6-5, all, or note-C (every C on the neck). */
export const QUIZ_RE = /^(string-[1-6]|strings-6-5|all|note-[A-G](#|b)?)$/;
export const isQuiz = (id: string) => QUIZ_RE.test(id);

export type QuizSpec = {
	id: string;
	strings: number[];
	/** Prompts per round. */
	prompts: number;
	/** note-X quizzes ask that one note. */
	fixed?: string;
	title: string;
};

export function quizSpec(id: string): QuizSpec {
	if (!isQuiz(id)) throw new Error(`Bad quiz: ${id}`);
	if (id.startsWith('string-')) {
		const s = Number(id.slice(7));
		return { id, strings: [s], prompts: 7, title: `Notes on string ${s}` };
	}
	if (id === 'strings-6-5')
		return { id, strings: [6, 5], prompts: 7, title: 'Notes on strings 6 and 5' };
	if (id === 'all') return { id, strings: [1, 2, 3, 4, 5, 6], prompts: 3, title: 'Every position' };
	const note = id.slice(5);
	return {
		id,
		strings: [1, 2, 3, 4, 5, 6],
		prompts: 1,
		fixed: note,
		title: `Find all the ${note}s`
	};
}

/** The most notes a round can find: every prompt's positions on the quiz's strings (frets 0–11). */
export const quizMaxFound = (spec: QuizSpec) => spec.prompts * spec.strings.length;

export const QUIZ_CHOICES = ['string-6', 'string-5', 'strings-6-5', 'all'] as const;

/** The notes a round asks, in order: each natural once (shuffled), or the fixed note. */
export function makeRound(spec: QuizSpec, rng: () => number = Math.random): string[] {
	if (spec.fixed) return [spec.fixed];
	const pool = [...NATURALS] as string[];
	for (let i = pool.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[pool[i], pool[j]] = [pool[j], pool[i]];
	}
	return pool.slice(0, spec.prompts);
}

/** Where a note is on the quiz's strings (frets 0–11): what must be found. */
export function targets(note: string, strings: number[]): { string: number; fret: number }[] {
	const pc = pcOf(note);
	const out: { string: number; fret: number }[] = [];
	for (const s of strings)
		for (let f = 0; f < 12; f++) if (midiAt(s, f) % 12 === pc) out.push({ string: s, fret: f });
	return out;
}

/** The target a tap finds (fret 12 and up fold to 0–11), or null when it is not the note. */
export function hitOf(note: string, strings: number[], string: number, fret: number) {
	if (!strings.includes(string) || fret < 0 || fret > FRETS) return null;
	const f = fret % 12;
	return targets(note, strings).find((t) => t.string === string && t.fret === f) ?? null;
}

/** A round passes with at most one wrong tap per ten notes found. */
export const roundPassed = (found: number, wrong: number) => wrong <= Math.floor(found / 10);

export const validQuizNote = (n: string) => isNoteName(n) && n.length <= 2;
