// M6 review fixes in the browser: the explorer's cropped neck and play highlight, quiz and ear
// feedback, the tuning notice inside lessons, the modes widget, 6/8 strums, slash chords and the
// warm-up's "what your hands do" before Start.
import { expect, test } from '@playwright/test';
import { targets } from '../../src/lib/fretboard/quiz';

test('explorer: no jump on load, box cropped to its frets, the sounding dot lit', async ({
	page
}, info) => {
	await page.goto('/tools/fretboard?scale=minor-pentatonic&root=A&box=1');
	const board = page.getByTestId('fretboard');
	await expect(board.getByTestId('fret-dot')).toHaveCount(12);
	expect(await page.evaluate(() => scrollY)).toBe(0);
	await expect(page.getByTestId('fb-bar')).toBeVisible();
	if (info.project.name === 'phone') {
		// A box ± a fret, big dots.
		await expect(board).toHaveAttribute('data-window', '4-9');
		const dot = (await board
			.getByTestId('fret-dot')
			.first()
			.locator('rect, circle')
			.last()
			.boundingBox())!;
		expect(dot.width).toBeGreaterThanOrEqual(28);
		await page.getByTestId('fb-full').click();
		await expect(board).toHaveAttribute('data-window', '0-15');
		await page.getByTestId('fb-full').click();
		await expect(board).toHaveAttribute('data-window', '4-9');
	}
	// String names beside the neck.
	for (const s of ['E', 'A', 'D', 'G', 'B', 'e'])
		await expect(board.locator('text', { hasText: new RegExp(`^${s}$`) }).first()).toBeAttached();
	await page.getByTestId('fb-play').click();
	await expect(board.locator('[data-testid=fret-dot][data-active=true]')).toHaveCount(1, {
		timeout: 3000
	});
	const bar = (await page.getByTestId('fb-bar').boundingBox())!;
	expect(bar.y).toBeGreaterThanOrEqual(0);
	await page.getByTestId('fb-play').click();
	await expect(board.locator('[data-testid=fret-dot][data-active=true]')).toHaveCount(0);
});

test('fretboard quiz: the neck shows idle; a miss shows where the note is', async ({ page }) => {
	await page.goto('/tools/fretboard?quiz=string-6');
	const quiz = page.getByTestId('fret-quiz');
	await expect(quiz.getByTestId('fretboard')).toBeVisible();
	await expect(quiz.getByTestId('quiz-caption')).not.toContainText('Notes on string 6');
	await page.getByTestId('quiz-start').click();
	const note = (await quiz.getAttribute('data-note'))!;
	const right = targets(note, [6])[0];
	await quiz
		.locator(`[data-testid=fret-cell][data-string="6"][data-fret="${(right.fret + 1) % 12}"]`)
		.dispatchEvent('pointerdown');
	await expect(quiz.locator('[data-testid=fret-mark][data-kind=miss]')).toHaveCount(1);
	const shown = quiz.locator('[data-testid=fret-mark][data-kind=show]');
	await expect(shown).toHaveCount(targets(note, [6]).length);
	await expect(shown.first()).toHaveAttribute('data-fret', String(right.fret));
	// The marked fret is on screen.
	await expect
		.poll(async () => {
			const box = (await shown.first().boundingBox())!;
			return box.y + box.height;
		})
		.toBeLessThanOrEqual(page.viewportSize()!.height);
	await expect(shown).toHaveCount(0, { timeout: 3000 });
	// The note picker is never cut off.
	const select = (await page.getByTestId('quiz-note-select').boundingBox())!;
	expect(select.x + select.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('ear trainer: after an answer every choice plays, then Next', async ({ page }) => {
	await page.goto('/tools/ear');
	await page.getByTestId('ear-tab-intervals').click();
	await expect(page.getByTestId('ear-locked-chip')).toContainText('more at 80%');
	await page.getByTestId('ear-start').click();
	const quiz = page.getByTestId('ear-quiz');
	await expect(page.getByTestId('ear-reference')).toHaveText(/Hear root/);
	// The header chips are the answer buttons.
	const choices = await quiz
		.getByTestId('ear-choice')
		.evaluateAll((els) => els.map((e) => e.getAttribute('data-choice')));
	const chips = await page
		.getByTestId('ear-active-chip')
		.evaluateAll((els) => els.map((e) => e.getAttribute('data-item')));
	expect(chips.sort()).toEqual([...choices].sort());
	// Locked items say so in the accuracy grid.
	await expect(page.locator('[data-testid=ear-stat][data-locked=true]').first()).toBeVisible();
	const item = (await quiz.getAttribute('data-item'))!;
	const wrong = choices.find((c) => c !== item)!;
	await quiz.locator(`[data-testid=ear-choice][data-choice="${wrong}"]`).click();
	await expect(quiz).toHaveAttribute('data-phase', 'answered');
	const right = quiz.locator(`[data-testid=ear-choice][data-choice="${item}"]`);
	await expect(right).toBeEnabled();
	await right.click();
	await expect(right).toHaveAttribute('data-state', 'right');
	await expect(quiz).toHaveAttribute('data-phase', 'answered');
	await page.getByTestId('ear-next').click();
	await expect(quiz).toHaveAttribute('data-phase', 'asking');
});

test('the tuning notice shows on exercise cards and inline tabs, spelled with sharps', async ({
	page
}) => {
	await page.goto('/learn/open-d-and-open-g');
	const card = page.getByTestId('exercise-card').filter({ has: page.getByTestId('tuning-notice') });
	await expect(card.first()).toBeVisible();
	const notice = card.first().getByTestId('tuning-notice');
	await expect(notice).toHaveAttribute('data-tuning', 'open-d');
	await expect(notice).toContainText('D A D F♯ A D');
	await expect(notice).not.toContainText('Gb');
});

test('the modes widget: one neck, a chip per mode, the colour note picked out', async ({
	page
}) => {
	await page.goto('/learn/the-seven-modes');
	const w = page.getByTestId('lesson-fretboard').filter({ has: page.getByTestId('mode-chips') });
	await expect(w.getByTestId('mode-chip')).toHaveCount(7);
	await w.locator('[data-testid=mode-chip][data-mode=lydian]').click();
	await expect(w.getByTestId('lesson-fretboard-title')).toContainText('♯4');
	await expect(w.locator('[data-testid=fret-dot][data-accent=true]').first()).toBeVisible();
	await w.locator('[data-testid=mode-chip][data-mode=ionian]').click();
	await expect(w.locator('[data-testid=fret-dot][data-accent=true]')).toHaveCount(0);
});

test('6/8 strums count 1 to 6 with 1 and 4 marked; slash chords show', async ({ page }) => {
	await page.goto('/learn/six-eight-ballad-strumming');
	const strum = page.getByTestId('strum').first();
	await expect(strum).toHaveAttribute('data-ts', '6/8');
	await expect(strum.getByTestId('strum-count')).toHaveText(['1', '2', '3', '4', '5', '6']);
	await page.goto('/learn/slash-chords-and-bass-walks');
	await expect(page.locator('[data-testid=chord-card][data-chord="G/F#"]').first()).toBeVisible();
});

test('a warm-up shows the neck and its step before Start', async ({ page }) => {
	await page.goto('/warmups/pent-box1-am');
	const runner = page.getByTestId('warmup-runner');
	await expect(runner).toHaveAttribute('data-phase', 'intro');
	const neck = runner.getByTestId('warmup-neck');
	await expect(neck.getByTestId('fret-dot')).toHaveCount(12);
	await expect(neck.locator('[data-testid=fret-dot][data-finger="4"]').first()).toBeAttached();
	// The step is not the how-to sentence again.
	const steps = await runner.getByTestId('warmup-steps').innerText();
	expect(steps).not.toContain('fingers 1 and 4');
	await expect(page.getByTestId('warmup-start')).toBeVisible();
});

test('a new-skill block on a fretboard or ear lesson embeds its quiz', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('start-card')).toHaveAttribute('data-ready', 'true');
	await page.getByTestId('length-10').click();
	await expect(page.getByTestId('plan')).toHaveAttribute('aria-busy', 'false');
	await page.getByTestId('start-session').click();
	await expect(page).toHaveURL(/\/session$/);
	// The same session with two new-skill blocks, as the planner makes them for these lessons.
	await page.addInitScript(() => {
		const s = JSON.parse(localStorage.getItem('sg:session')!);
		if (s.patched) return;
		const one = s.blocks[0];
		s.blocks = [
			{
				...one,
				kind: 'new',
				title: 'Notes on the low E string',
				target: { type: 'lesson', id: 'notes-low-e-string' }
			},
			{
				...one,
				kind: 'new',
				title: 'Hearing chord quality',
				target: { type: 'lesson', id: 'hearing-chord-quality' }
			}
		];
		s.results = [null, null];
		s.notes = [{}, {}];
		s.idx = 0;
		s.patched = true;
		localStorage.setItem('sg:session', JSON.stringify(s));
	});
	await page.reload();
	const widget = page.getByTestId('lesson-widget');
	await expect(widget).toHaveAttribute('data-widget', 'fretboard');
	await expect(widget.getByTestId('inline-fretquiz').getByTestId('fret-quiz')).toBeVisible();
	await expect(widget.getByTestId('quiz-start')).toBeVisible();
	await page.getByTestId('skip-block').click();
	await expect(page.getByTestId('session-runner')).toHaveAttribute('data-idx', '1');
	await expect(widget).toHaveAttribute('data-widget', 'ear');
	await expect(widget.getByTestId('inline-ear')).toBeVisible();
});

test('a 6/8 exercise: its strum row counts 1 to 6, the big beats on 1 and 4', async ({ page }) => {
	await page.goto('/practice/exercise/six-eight-strum-g-em-c-d');
	const row = page.getByTestId('strum-row').first();
	await expect(row).toHaveAttribute('data-ts', '6/8');
	await expect(row.getByTestId('strum-row-count')).toHaveText(['1', '2', '3', '4', '5', '6']);
	await expect(row.getByTestId('strum-row-count').nth(3)).toHaveClass(/font-extrabold/);
	await expect(row.getByTestId('strum-row-count').nth(1)).not.toHaveClass(/font-extrabold/);
});
