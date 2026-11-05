// M6 in the static demo: the fretboard explorer and quiz, the ear trainer and the example lessons,
// with results kept in the browser's database.
import { expect, test } from '@playwright/test';
import { answerEar, playQuiz } from '../e2e/m6-helpers';

test('fretboard explorer overlays', async ({ page }) => {
	await page.goto('tools/fretboard?scale=minor-pentatonic&root=A&box=1&labels=intervals');
	await expect(page.getByTestId('fretboard')).toHaveAttribute('data-orientation', 'vertical');
	await expect(page.getByTestId('fret-dot')).toHaveCount(12);
	await page.getByTestId('fb-tab-caged').click();
	await expect(page.getByTestId('fret-region')).toHaveCount(5);
});

test('fretboard quiz result is stored in the browser', async ({ page }) => {
	await page.goto('tools/fretboard?quiz=string-5');
	const result = await playQuiz(page, 'string-5');
	await expect(result).toHaveAttribute('data-passed', 'true');
	await page.reload();
	await expect(page.getByTestId('fret-quiz')).toContainText(/best/i);
});

test('ear trainer answers are stored and adapt the choices', async ({ page }) => {
	await page.goto('tools/ear?kind=chords&set=major,minor,7');
	const quiz = page.getByTestId('ear-quiz');
	await expect(quiz).toHaveAttribute('data-choices', '2');
	await page.getByTestId('ear-start').click();
	await answerEar(quiz, 20);
	await expect(quiz).toHaveAttribute('data-choices', '3');
	await page.reload();
	await expect(page.getByTestId('ear-quiz')).toHaveAttribute('data-choices', '3');
	await expect(page.locator('[data-testid=ear-stat][data-item=major]')).not.toHaveAttribute(
		'data-total',
		'0'
	);
});

test('example lessons render their widgets; the quiz passes the fretboard check', async ({
	page
}) => {
	await page.goto('learn/minor-pentatonic-box-1');
	await expect(page.getByTestId('lesson-fretboard')).toHaveCount(2);
	await expect(page.getByTestId('lesson-ear')).toBeVisible();
	await expect(page.getByTestId('lesson-song')).toBeVisible();
	await page.goto('learn/notes-low-e-string');
	await expect(page.getByTestId('lesson-fretboard').getByTestId('fret-dot')).toHaveCount(8);
	const result = await playQuiz(page, 'string-6');
	await expect(result).toHaveAttribute('data-passed', 'true');
	await page.getByTestId('mastery-open').click();
	await expect(page.getByTestId('mastery-passed')).toBeVisible();
});

test('gaps: DADGAD notice, 16th strum row and the barre F in the demo', async ({ page }) => {
	await page.goto('practice/exercise/dadgad-drone');
	const notice = page.getByTestId('tuning-notice');
	await expect(notice).toContainText('Tuning: DADGAD — retune first');
	await notice.click();
	await expect(page).toHaveURL(/tools\/tuner\?tuning=dadgad/);
	await expect(page.getByTestId('tuning-select')).toHaveValue('dadgad');
	await page.goto('practice/exercise/sixteenth-strums-em-c-g-d');
	await expect(page.getByTestId('strum-row')).toHaveAttribute('data-sub', '16');
	await page.goto('practice/exercise/c-am-f-g-full-f');
	await expect(page.locator('[data-testid=chord-mini][data-chord=F]')).toHaveAttribute(
		'data-voicing',
		'1-3-3-2-1-1'
	);
});

test('first load stays small; a lesson body loads when the lesson opens', async ({ page }) => {
	const sizes = new Map<string, number>();
	page.on('response', async (r) => {
		try {
			sizes.set(r.url(), (await r.body()).length);
		} catch {
			// a redirect or an aborted request has no body
		}
	});
	await page.goto('./');
	await expect(page.getByTestId('plan-block').first()).toBeVisible({ timeout: 30_000 });
	await page.waitForLoadState('networkidle');
	const total = [...sizes.values()].reduce((a, b) => a + b, 0);
	console.log(`demo first load: ${total} bytes in ${sizes.size} files`);
	expect(total).toBeLessThanOrEqual(1_450_000);
	expect([...sizes.keys()].some((u) => /\/lesson-[\w-]+\.[\w-]+\.json$/.test(u))).toBe(false);
	sizes.clear();
	await page.goto('learn/open-d-and-open-g');
	await expect(page.getByTestId('tuning-notice').first()).toBeVisible();
	// Only this lesson's payload: no other lesson's body, no whole curriculum. (Bodies are read
	// asynchronously by the response listener: wait for the entry.)
	const lessonUrls = () =>
		[...sizes.keys()].filter((u) => /\/lesson-[\w-]+\.[\w-]+\.json$/.test(u));
	await expect.poll(() => lessonUrls().length).toBeGreaterThan(0);
	await page.waitForLoadState('networkidle');
	const lessons = lessonUrls();
	expect(lessons).toHaveLength(1);
	expect(lessons[0]).toMatch(/lesson-open-d-and-open-g\.[\w-]+\.json$/);
	expect([...sizes.keys()].some((u) => /content\.[\w-]+\.json$/.test(u))).toBe(false);
});
