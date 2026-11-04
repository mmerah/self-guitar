// Browser-side loads and writes for the fretboard quiz.
import { getOptional, sendJson } from '$lib/api';
import type { QuizSummary } from '$lib/core/ear';
import { clientTz } from '$lib/session/time';

export const loadQuizzes = (f: typeof fetch = fetch) =>
	getOptional<QuizSummary[]>(f, '/api/fretboard', []);

/** Saves one round; null when it could not be saved. */
export async function saveQuizRound(
	quiz: string,
	found: number,
	wrong: number,
	ms: number
): Promise<QuizSummary | null> {
	try {
		const res = await sendJson('/api/fretboard', 'POST', {
			quiz,
			found,
			wrong,
			ms,
			tz: clientTz()
		});
		return res.ok ? ((await res.json()) as QuizSummary) : null;
	} catch {
		return null;
	}
}
