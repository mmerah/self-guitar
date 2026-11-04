import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { answerEar, playQuiz } from './m6-helpers';
import { micWavPath } from './wav';

// M6: the fretboard explorer and its quiz, the ear trainer (answering, adapting, storing), the
// example lessons' widgets and the fretboard mastery check.

const dots = (page: import('@playwright/test').Page) => page.getByTestId('fret-dot');

test('fretboard explorer: box, labels, CAGED, triads, notes, hide', async ({ page }, info) => {
	await page.goto('/tools/fretboard?scale=minor-pentatonic&root=A&box=1&labels=intervals');
	const board = page.getByTestId('fretboard');
	await expect(board).toHaveAttribute(
		'data-orientation',
		info.project.name === 'phone' ? 'vertical' : 'horizontal'
	);
	await expect(board).toHaveAttribute('aria-label', 'A minor pentatonic · box 1');
	await expect(dots(page)).toHaveCount(12);
	await expect(page.locator('[data-testid=fret-dot][data-root=true]')).toHaveCount(3);
	await expect(
		page.locator('[data-testid=fret-dot][data-string="6"][data-fret="5"]')
	).toHaveAttribute('data-label', 'R');
	await expect(
		page.locator('[data-testid=fret-dot][data-string="6"][data-fret="8"]')
	).toHaveAttribute('data-label', '♭3');
	await page.getByTestId('fb-labels-notes').click();
	await expect(
		page.locator('[data-testid=fret-dot][data-string="6"][data-fret="8"]')
	).toHaveAttribute('data-label', 'C');
	await page.getByTestId('fb-labels-fingers').click();
	await expect(
		page.locator('[data-testid=fret-dot][data-string="6"][data-fret="8"]')
	).toHaveAttribute('data-label', '4');
	await expect(page).toHaveURL(/labels=fingers/);
	await page.getByTestId('fb-box-2').click();
	await expect(
		page.locator('[data-testid=fret-dot][data-string="6"][data-fret="8"]')
	).toHaveAttribute('data-label', '2');
	// Hide names: a tap reveals one.
	await page.getByTestId('fb-labels-notes').click();
	await page.getByTestId('fb-hide').click();
	const d = page.locator('[data-testid=fret-dot][data-string="5"][data-fret="7"]');
	await expect(d).toHaveAttribute('data-label', '');
	await d.click();
	await expect(d).toHaveAttribute('data-label', 'E');
	await page.getByTestId('fb-hide').click();

	await page.getByTestId('fb-tab-caged').click();
	await expect(page.getByTestId('fret-region')).toHaveText(['C', 'A', 'G', 'E', 'D']);
	await page.getByTestId('fb-shape-E').click();
	await expect(dots(page)).toHaveCount(6);
	await expect(page.getByTestId('fret-region')).toHaveCount(0);

	await page.getByTestId('fb-tab-triads').click();
	await expect(page.getByTestId('fret-region').first()).toBeVisible();
	await page.getByTestId('fb-tab-notes').click();
	await page.getByTestId('fb-notes').selectOption('C');
	// The whole neck shows frets 0–12 (Full neck: to 15).
	await expect(page.locator('[data-testid=fret-dot][data-label="C"]')).toHaveCount(6);

	// Play scale: the play button toggles to stop and back.
	await page.getByTestId('fb-tab-scale').click();
	const play = page.getByTestId('fb-play').filter({ visible: true });
	await play.click();
	await expect(play).toHaveAttribute('aria-pressed', 'true');
	await play.click();
	await expect(play).toHaveAttribute('aria-pressed', 'false');
});

test('fretboard quiz: find all the Cs, wrong taps count, the round is stored', async ({ page }) => {
	await page.goto('/tools/fretboard?quiz=note-C');
	let result = await playQuiz(page, 'note-C', true);
	// One miss in six notes is too many to count.
	await expect(result).toHaveAttribute('data-passed', 'false');
	await expect(result).toContainText('6 notes · 1 miss');
	await expect(result).toContainText('Too many misses');
	await page.reload();
	result = await playQuiz(page, 'note-C');
	await expect(result).toHaveAttribute('data-passed', 'true');
	await expect(result).toContainText('best');
	const all = (await (await page.request.get('/api/fretboard')).json()) as {
		quiz: string;
		best: number | null;
	}[];
	expect(all.find((q) => q.quiz === 'note-C')?.best).toBeGreaterThan(0);
});

test('ear trainer: answers, adapts from 2 choices and stores results', async ({ page }, info) => {
	// Each project its own set (both runs share one database; levels come from stored answers).
	const set = info.project.name === 'phone' ? ['P8', 'P5', 'P4'] : ['M3', 'm3', 'M2'];
	await page.goto(`/tools/ear?kind=intervals&set=${set.join(',')}&dir=asc`);
	const quiz = page.getByTestId('ear-quiz');
	await expect(quiz).toHaveAttribute('data-choices', '2');
	await page.getByTestId('ear-start').click();
	await expect(page.getByTestId('ear-choice')).toHaveCount(2);
	// A wrong answer: shown, the streak resets, Next moves on.
	const item = (await quiz.getAttribute('data-item'))!;
	await quiz.locator(`[data-testid=ear-choice]:not([data-choice="${item}"])`).click();
	await expect(quiz.locator(`[data-choice="${item}"]`)).toHaveAttribute('data-state', 'right');
	await expect(page.getByTestId('ear-streak')).toHaveAttribute('data-streak', '0');
	await page.getByTestId('ear-next').click();
	// 20 right in a row (the last 20 at 100%): a third choice unlocks.
	await answerEar(quiz, 20);
	await expect(quiz).toHaveAttribute('data-choices', '3');
	await expect(page.getByTestId('ear-streak')).toHaveAttribute('data-streak', /^(19|20|21)$/);
	const stored = (await (await page.request.get('/api/ear?kind=intervals')).json()) as {
		history: unknown[];
		items: { item: string; total: number }[];
	};
	expect(stored.history.length).toBeGreaterThanOrEqual(21);
	// Per-item accuracy on the page, and the level survives a reload (from the stored history).
	await expect(page.locator(`[data-testid=ear-stat][data-item=${set[0]}]`)).not.toHaveAttribute(
		'data-total',
		'0'
	);
	await page.reload();
	await expect(page.getByTestId('ear-quiz')).toHaveAttribute('data-choices', '3');

	// Chords and progressions answer too.
	await page.getByTestId('ear-tab-chords').click();
	await page.getByTestId('ear-start').click();
	await answerEar(page.getByTestId('ear-quiz'), 2);
	await page.getByTestId('ear-tab-progressions').click();
	await page.getByTestId('ear-start').click();
	await expect(page.getByTestId('ear-slots').locator('li')).toHaveCount(4);
	await answerEar(page.getByTestId('ear-quiz'), 1);
	const prog = (await (await page.request.get('/api/ear?kind=progressions')).json()) as {
		history: unknown[];
	};
	expect(prog.history.length % 3).toBe(0);
	expect(prog.history.length).toBeGreaterThanOrEqual(3);
});

test('ear trainer keys: digits answer, Space replays', async ({ page }, info) => {
	test.skip(info.project.name === 'phone', 'keyboard');
	await page.goto('/tools/ear?kind=chords&set=major,minor');
	await page.getByTestId('ear-start').click();
	const quiz = page.getByTestId('ear-quiz');
	const item = (await quiz.getAttribute('data-item'))!;
	await page.keyboard.press('Space');
	await page.keyboard.press(item === 'major' ? '1' : '2');
	await expect(quiz.locator(`[data-choice="${item}"]`)).toHaveAttribute('data-state', 'right');
});

test('play it back: the mic hears the note', async ({ playwright }, info) => {
	const browser = await playwright.chromium.launch({
		executablePath: fs.existsSync('/opt/pw-browsers/chromium')
			? '/opt/pw-browsers/chromium'
			: undefined,
		args: [
			'--use-fake-device-for-media-stream',
			'--use-fake-ui-for-media-stream',
			`--use-file-for-fake-audio-capture=${micWavPath('sineA2')}`
		]
	});
	const page = await (
		await browser.newContext({
			baseURL: info.project.use.baseURL,
			viewport: info.project.use.viewport
		})
	).newPage();
	await page.goto('/tools/ear?kind=playback&note=A');
	await page.getByTestId('playback-start').click();
	await expect(page.getByTestId('ear-playback')).toHaveAttribute('data-status', 'right', {
		timeout: 15_000
	});
	// About a second later the next note plays by itself (and is heard again).
	await expect(page.getByTestId('playback-score')).toHaveText(/^[2-9]\/[2-9]$/, {
		timeout: 8000
	});
	await browser.close();
});

test('L5 example lesson: fretboard, exercise, ear quiz and song card', async ({ page }) => {
	await page.goto('/learn/minor-pentatonic-box-1');
	const boards = page.getByTestId('lesson-fretboard');
	await expect(boards).toHaveCount(2);
	await expect(boards.first().getByTestId('fret-dot')).toHaveCount(12);
	await expect(
		boards.first().locator('[data-testid=fret-dot][data-fret="8"]').first()
	).toHaveAttribute('data-label', '4');
	await expect(page.getByTestId('exercise-card')).toBeVisible();
	await expect(page.getByTestId('lesson-song')).toContainText('A minor');
	const ear = page.getByTestId('lesson-ear');
	await ear.getByTestId('ear-start').click();
	await answerEar(ear.getByTestId('ear-quiz'), 10);
	await expect(ear.getByTestId('ear-done')).toContainText('10 / 10');
	await boards.first().getByTestId('fretboard-open').click();
	await expect(page).toHaveURL(/\/tools\/fretboard\?.*box=1.*from=minor-pentatonic-box-1/);
	await expect(page.getByTestId('tool-back')).toHaveAttribute(
		'href',
		/\/learn\/minor-pentatonic-box-1$/
	);
});

test('L6 example lesson: notes overlay, quiz, and the fretboard mastery check', async ({
	page
}) => {
	await page.goto('/learn/notes-low-e-string');
	await expect(page.getByTestId('lesson-fretboard').getByTestId('fret-dot')).toHaveCount(8);
	if (test.info().project.name === 'phone') {
		// (The desktop run follows the phone run on the same database.)
		await page.getByTestId('mastery-open').click();
		await expect(page.getByTestId('mastery-sheet')).toHaveAttribute('data-done', 'false');
		await page.getByRole('button', { name: 'Close' }).click();
	}
	const result = await playQuiz(page, 'string-6');
	await expect(result).toHaveAttribute('data-passed', 'true');
	await expect(result).toContainText('Goal of 30 s reached');
	await page.getByTestId('mastery-open').click();
	await expect(page.getByTestId('mastery-passed')).toBeVisible();
	await expect(page.getByTestId('lesson-state')).toHaveAttribute('data-state', 'mastered');
});
