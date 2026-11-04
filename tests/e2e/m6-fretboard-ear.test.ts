// M6 fretboard / ear fixes at three screen shapes: portrait phone, landscape phone, desktop. The
// neck fills the width with big enough dots, the explorer's bar stays in view, the quiz flashes
// where a missed note is, the play-back drill's tabs fit. SHOTS=dir also saves screenshots.
import { expect, test, type Page } from '@playwright/test';
import { targets } from '../../src/lib/fretboard/quiz';

const SHOTS = process.env.SHOTS;
const SHAPES = [
	{ name: 'phone', width: 390, height: 844, dark: true },
	{ name: 'landscape', width: 844, height: 390, dark: false },
	{ name: 'desktop', width: 1440, height: 900, dark: false }
] as const;

async function shot(page: Page, name: string) {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** The smallest rendered dot (rect or circle of r=14) on a neck. */
async function smallestDot(page: Page, scope = page.getByTestId('fretboard').first()) {
	const sizes = await scope
		.locator('[data-testid=fret-dot] > rect, [data-testid=fret-dot] > circle[r="14"]')
		.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
	return Math.min(...sizes);
}

test.describe.configure({ mode: 'serial' });
test.beforeEach(() => {
	test.skip(test.info().project.name !== 'phone', 'sets its own viewports');
});

for (const shape of SHAPES) {
	test.describe(shape.name, () => {
		test.use({
			viewport: { width: shape.width, height: shape.height },
			colorScheme: shape.dark ? 'dark' : 'light',
			isMobile: shape.name !== 'desktop',
			hasTouch: shape.name !== 'desktop'
		});

		test('explorer box 1 while playing', async ({ page }) => {
			await page.goto('/tools/fretboard?scale=minor-pentatonic&root=A&box=1');
			const board = page.getByTestId('fretboard');
			await expect(board.getByTestId('fret-dot')).toHaveCount(12);
			expect(await page.evaluate(() => scrollY)).toBe(0);
			const min = await smallestDot(page);
			expect(min).toBeGreaterThanOrEqual(shape.name === 'phone' ? 28 : 24);
			const b = (await board.boundingBox())!;
			// The whole neck on screen, as wide as the page allows.
			expect(b.y + b.height).toBeLessThanOrEqual(shape.height + 1);
			expect(b.x + b.width).toBeLessThanOrEqual(shape.width);
			if (shape.name !== 'phone') expect(b.width).toBeGreaterThan(shape.width * 0.6);
			if (shape.name === 'landscape') {
				// Controls beside the neck, the neck full width of its column.
				const c = (await page.getByTestId('fretboard-controls').boundingBox())!;
				expect(c.height).toBeLessThan(shape.height);
			}
			await page.getByTestId('fb-play').click();
			await expect(board.locator('[data-testid=fret-dot][data-active=true]')).toHaveCount(1, {
				timeout: 3000
			});
			await page.waitForTimeout(1600);
			await expect(page.getByTestId('fb-bar')).toBeInViewport();
			await shot(page, `fretboard-box1-playing-${shape.name}`);
			await page.getByTestId('fb-play').click();
		});

		test('quiz after a miss', async ({ page }) => {
			await page.goto('/tools/fretboard?quiz=string-6');
			const quiz = page.getByTestId('fret-quiz');
			await expect(quiz.getByTestId('fretboard')).toBeVisible();
			await page.getByTestId('quiz-start').click();
			// Let the bar scroll to the top first.
			await page.waitForTimeout(700);
			const note = (await quiz.getAttribute('data-note'))!;
			const right = targets(note, [6])[0];
			await quiz
				.locator(`[data-testid=fret-cell][data-string="6"][data-fret="${(right.fret + 1) % 12}"]`)
				.dispatchEvent('pointerdown');
			const shown = quiz.locator('[data-testid=fret-mark][data-kind=show]');
			await expect(shown.first()).toBeInViewport();
			await expect(page.getByTestId('quiz-bar')).toBeInViewport();
			await shot(page, `quiz-miss-${shape.name}`);
			const select = (await page.getByTestId('quiz-note-select').boundingBox())!;
			expect(select.x + select.width).toBeLessThanOrEqual(shape.width);
		});

		test('ear after a wrong answer', async ({ page }) => {
			await page.goto('/tools/ear');
			await page.getByTestId('ear-tab-intervals').click();
			await page.getByTestId('ear-start').click();
			const quiz = page.getByTestId('ear-quiz');
			const item = (await quiz.getAttribute('data-item'))!;
			const choices = await quiz
				.getByTestId('ear-choice')
				.evaluateAll((els) => els.map((e) => e.getAttribute('data-choice')));
			await quiz
				.locator(`[data-testid=ear-choice][data-choice="${choices.find((c) => c !== item)}"]`)
				.click();
			await expect(quiz).toHaveAttribute('data-phase', 'answered');
			await expect(page.getByTestId('ear-next')).toBeVisible();
			await shot(page, `ear-wrong-${shape.name}`);
		});

		test('play-back tabs fit', async ({ page }) => {
			await page.goto('/tools/ear');
			await page.getByTestId('ear-tab-playback').click();
			for (const k of ['intervals', 'chords', 'progressions', 'playback']) {
				const t = (await page.getByTestId(`ear-tab-${k}`).boundingBox())!;
				expect(t.x).toBeGreaterThanOrEqual(0);
				expect(t.x + t.width).toBeLessThanOrEqual(shape.width);
			}
		});

		test('the modes widget', async ({ page }) => {
			await page.goto('/learn/the-seven-modes');
			const w = page
				.getByTestId('lesson-fretboard')
				.filter({ has: page.getByTestId('mode-chips') });
			await w.locator('[data-testid=mode-chip][data-mode=lydian]').click();
			await expect(w.locator('[data-testid=fret-dot][data-accent=true]').first()).toBeVisible();
			await w.scrollIntoViewIfNeeded();
			const dots = w.locator('[data-testid=fret-dot]');
			expect(await dots.count()).toBeGreaterThan(0);
			await shot(page, `modes-widget-${shape.name}`);
		});
	});
}
