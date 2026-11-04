// The adaptive ear trainer, pure (the random source is injected, so it is unit-tested):
// - choices: a set starts with its first 2 items (teaching order); one more unlocks each time the
//   last LEVEL_WINDOW answers on the unlocked items reach LEVEL_ACCURACY;
// - spaced repetition on confusions: a wrong answer (heard X, said Y) brings X back 2 questions
//   later and Y 4 later, so the pair is heard again side by side while it is fresh;
// - otherwise items are drawn at random, weaker ones more often, never the same twice in a row.
// The history replayed (oldest first) is the stored results, so progress carries across visits.

export const START_CHOICES = 2;
export const LEVEL_WINDOW = 20;
export const LEVEL_ACCURACY = 0.8;
/** Questions until a confused item (and the answer it was mistaken for) come back. */
export const RETRY_AFTER = 2;
export const RETRY_PARTNER_AFTER = 4;

export type EarAnswer = { item: string; answer: string; correct: boolean };
export type Rng = () => number;

/** Choices unlocked for `set` (teaching order) after replaying `history` (oldest first). */
export function unlocked(history: readonly EarAnswer[], set: readonly string[]): number {
	let n = Math.min(START_CHOICES, set.length);
	let window: boolean[] = [];
	for (const r of history) {
		if (n >= set.length) break;
		if (!set.slice(0, n).includes(r.item)) continue;
		window.push(r.correct);
		if (window.length > LEVEL_WINDOW) window.shift();
		if (window.length === LEVEL_WINDOW && accuracy(window) >= LEVEL_ACCURACY) {
			n++;
			window = [];
		}
	}
	return n;
}

const accuracy = (w: boolean[]) => (w.length ? w.filter(Boolean).length / w.length : 0);

export type ItemStats = Record<string, { total: number; correct: number }>;

export function itemStats(history: readonly EarAnswer[]): ItemStats {
	const out: ItemStats = {};
	for (const r of history) {
		const s = (out[r.item] ??= { total: 0, correct: 0 });
		s.total++;
		if (r.correct) s.correct++;
	}
	return out;
}

/** The trainer for one set: what to ask next, and what an answer changes. */
export class EarTrainer {
	readonly set: string[];
	private history: EarAnswer[];
	private queue: { item: string; at: number }[] = [];
	private asked = 0;
	private last: string | null = null;
	streak = 0;
	bestStreak = 0;
	right = 0;
	total = 0;

	constructor(
		set: readonly string[],
		history: readonly EarAnswer[] = [],
		private rng: Rng = Math.random
	) {
		this.set = [...set];
		this.history = history.filter((r) => set.includes(r.item));
		// The pair confused most often lately comes up first.
		const pairs = new Map<string, number>();
		for (const r of this.history.slice(-50))
			if (!r.correct && set.includes(r.answer)) {
				const k = [r.item, r.answer].join('|');
				pairs.set(k, (pairs.get(k) ?? 0) + 1);
			}
		const worst = [...pairs.entries()].sort((a, b) => b[1] - a[1])[0];
		if (worst) {
			const [a, b] = worst[0].split('|');
			if (this.active.includes(a)) this.queue.push({ item: a, at: 0 });
			if (this.active.includes(b)) this.queue.push({ item: b, at: 2 });
		}
	}

	/** The unlocked items: the answer buttons. */
	get active(): string[] {
		return this.set.slice(0, unlocked(this.history, this.set));
	}

	get stats(): ItemStats {
		return itemStats(this.history);
	}

	/** The next item to ask (not `avoid`, e.g. the chord just before in a progression). */
	next(avoid: string | null = this.last): string {
		const active = this.active;
		const due = this.queue.findIndex(
			(q) =>
				q.at <= this.asked && active.includes(q.item) && (q.item !== avoid || active.length < 2)
		);
		if (due >= 0) return this.queue.splice(due, 1)[0].item;
		const pool = active.length > 1 ? active.filter((i) => i !== avoid) : active;
		const stats = this.stats;
		// Weaker items weigh more: 1 + 2 × the miss rate (unseen items count as half right).
		const weights = pool.map((i) => {
			const s = stats[i];
			const acc = ((s?.correct ?? 0) + 1) / ((s?.total ?? 0) + 2);
			return 1 + 2 * (1 - acc);
		});
		let r = this.rng() * weights.reduce((a, b) => a + b, 0);
		for (const [k, w] of weights.entries()) if ((r -= w) < 0) return pool[k];
		return pool[pool.length - 1];
	}

	/** Records an answer; says whether it was right and whether a new choice unlocked. */
	answer(item: string, answer: string): { correct: boolean; unlockedItem: string | null } {
		const before = this.active.length;
		const correct = item === answer;
		this.history.push({ item, answer, correct });
		this.asked++;
		this.last = item;
		this.total++;
		if (correct) {
			this.right++;
			this.streak++;
			this.bestStreak = Math.max(this.bestStreak, this.streak);
		} else {
			this.streak = 0;
			this.queue = this.queue.filter((q) => q.item !== item && q.item !== answer);
			this.queue.push({ item, at: this.asked + RETRY_AFTER });
			if (this.set.includes(answer))
				this.queue.push({ item: answer, at: this.asked + RETRY_PARTNER_AFTER });
		}
		const after = this.active;
		return { correct, unlockedItem: after.length > before ? after[after.length - 1] : null };
	}
}
