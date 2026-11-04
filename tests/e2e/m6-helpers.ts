// Shared by the self-hosted and demo M6 tests: answering the ear quiz and the fretboard quiz the
// way a learner would (the right answer is read from the quiz, the positions from the theory).
import { expect, type Locator, type Page } from '@playwright/test';
import { quizSpec, targets } from '../../src/lib/fretboard/quiz';

/** Answers `n` questions of an ear quiz right (it moves on by itself after a right answer). */
export async function answerEar(quiz: Locator, n: number) {
	for (let i = 0; i < n; i++) {
		await expect(quiz).toHaveAttribute('data-phase', 'asking');
		const asked = Number(await quiz.getAttribute('data-asked'));
		for (const item of (await quiz.getAttribute('data-item'))!.split(','))
			await quiz.locator(`[data-testid=ear-choice][data-choice="${item}"]`).click();
		await expect(async () => {
			const phase = await quiz.getAttribute('data-phase');
			const now = Number(await quiz.getAttribute('data-asked'));
			expect(phase === 'done' || (phase === 'asking' && now > asked)).toBe(true);
		}).toPass({ timeout: 5000 });
	}
}

/** Plays a fretboard quiz round to the end, tapping every target of each prompt. */
export async function playQuiz(page: Page, quizId: string, wrongFirst = false) {
	const quiz = page.getByTestId('fret-quiz');
	await quiz.getByTestId('quiz-start').click();
	const spec = quizSpec(quizId);
	if (wrongFirst) {
		const note = (await quiz.getAttribute('data-note'))!;
		const right = targets(note, spec.strings)[0];
		await quiz
			.locator(
				`[data-testid=fret-cell][data-string="${right.string}"][data-fret="${(right.fret + 1) % 12}"]`
			)
			.dispatchEvent('pointerdown');
	}
	for (let i = 0; i < spec.prompts; i++) {
		await expect(quiz).toHaveAttribute('data-phase', 'running');
		const note = (await quiz.getAttribute('data-note'))!;
		for (const t of targets(note, spec.strings))
			await quiz
				.locator(`[data-testid=fret-cell][data-string="${t.string}"][data-fret="${t.fret}"]`)
				.dispatchEvent('pointerdown');
		if (i < spec.prompts - 1) await expect(quiz).not.toHaveAttribute('data-note', note);
	}
	await expect(quiz).toHaveAttribute('data-phase', 'done');
	return quiz.getByTestId('quiz-result');
}
