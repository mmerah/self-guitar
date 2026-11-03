// "Am I improving?": the clearest gains in the history window, as short headlines.
import type { History } from '$lib/core/session';

export type Gain = { text: string; delta: number };

const weeksText = (days: number) =>
	days >= 14 ? `${Math.round(days / 7)} weeks` : days >= 2 ? `${days} days` : 'a day';

const span = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** Up to `n` gains, biggest first (relative to where each started). */
export function gains(h: Pick<History, 'exercises' | 'pairs'>, n = 3): Gain[] {
	const out: (Gain & { rel: number })[] = [];
	for (const ex of h.exercises) {
		const [first, last] = [ex.points[0], ex.points[ex.points.length - 1]];
		const delta = last.value - first.value;
		if (ex.points.length < 2 || delta <= 0) continue;
		out.push({
			text: `+${delta} BPM on ${ex.title} in ${weeksText(span(first.date, last.date))}`,
			delta,
			rel: delta / first.value
		});
	}
	for (const p of h.pairs) {
		const [first, last] = [p.points[0], p.points[p.points.length - 1]];
		const delta = last.value - first.value;
		if (p.points.length < 2 || delta <= 0) continue;
		out.push({
			text: `${p.a}–${p.b}: ${first.value} → ${last.value} changes/min`,
			delta,
			rel: delta / Math.max(1, first.value)
		});
	}
	// The best two of each kind, then the biggest first.
	const ex = out.filter((g) => g.text.includes('BPM')).sort((a, b) => b.rel - a.rel);
	const ch = out.filter((g) => !g.text.includes('BPM')).sort((a, b) => b.rel - a.rel);
	return [...ex.slice(0, 2), ...ch.slice(0, 2)]
		.sort((a, b) => b.rel - a.rel)
		.slice(0, n)
		.map(({ text, delta }) => ({ text, delta }));
}
