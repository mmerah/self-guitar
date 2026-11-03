import { expect, test, type Page } from '@playwright/test';

// Phone and desktop share one server database: the tests compare before/after values instead of
// assuming a fresh state. The block timers run on Playwright's fake clock.

const today = () => {
	const d = new Date();
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

async function noHorizontalScroll(page: Page) {
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
	expect(overflow).toBeLessThanOrEqual(0);
}

async function startFive(page: Page) {
	await page.goto('/');
	await page.evaluate(() => localStorage.removeItem('sg:session'));
	await page.reload();
	await expect(page.getByTestId('start-card')).toHaveAttribute('data-ready', 'true');
	// After today's session: "Practise more" brings the plan back.
	if (await page.getByTestId('practise-more').isVisible())
		await page.getByTestId('practise-more').click();
	await page.getByTestId('length-5').click();
	await expect(page.getByTestId('start-session')).toHaveText(/Start 5-min session/);
	await expect(page.getByTestId('plan')).toHaveAttribute('data-source', 'server');
	const blocks = page.getByTestId('plan-block');
	await expect(blocks.first()).toBeVisible();
	const n = await blocks.count();
	expect(n).toBeGreaterThanOrEqual(2);
	await page.getByTestId('start-session').click();
	await expect(page).toHaveURL(/\/session$/);
	await expect(page.getByTestId('session-runner')).toHaveAttribute('data-idx', '0');
	return n;
}

test('a 5-minute session from Today: blocks, ratings, reload, summary, history and ring', async ({
	page
}) => {
	await page.clock.install();
	await page.goto('/');
	const ring = page.getByTestId('weekly-ring');
	await expect(ring).toBeVisible();
	const minutesBefore = Number(await ring.getAttribute('data-minutes'));
	await noHorizontalScroll(page);

	const n = await startFive(page);
	const runner = page.getByTestId('session-runner');
	await expect(page.getByTestId('block-title')).not.toBeEmpty();
	await expect(page.getByTestId('block-why')).not.toBeEmpty();
	await expect(page.getByTestId('block-timer')).toHaveText(/^\d+:\d\d$/);

	// Block 1 runs out: a soft banner, the block stays on screen until Done.
	await page.clock.fastForward('05:00');
	await expect(page.getByTestId('time-up')).toBeVisible();
	await expect(runner).toHaveAttribute('data-phase', 'play');
	await expect(page.getByTestId('block-surface')).toBeVisible();
	await page.getByTestId('block-done').click();
	await expect(runner).toHaveAttribute('data-phase', 'rate');
	await page.getByTestId('rate-ok').click();
	// Only the planned time (+ a little grace) is saved, not the 5 minutes away.
	const first = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:session')!));
	expect(first.results[0].actualSec).toBeLessThanOrEqual(first.blocks[0].minutes * 60 + 30);
	await expect(runner).toHaveAttribute('data-idx', '1');

	// Reload mid-block: the session resumes on the same block.
	await page.clock.fastForward('00:20');
	await page.reload();
	await expect(page.getByTestId('session-runner')).toHaveAttribute('data-idx', '1');

	// Pause holds the timer; +1 min adds a minute.
	const timer = page.getByTestId('block-timer');
	await page.getByTestId('timer-toggle').click();
	const paused = await timer.textContent();
	await page.clock.fastForward('00:10');
	await expect(timer).toHaveText(paused!);
	await page.getByTestId('plus-one').click();
	const [m, s] = paused!.split(':').map(Number);
	await expect(timer).toHaveText(`${m + 1}:${String(s).padStart(2, '0')}`);
	await page.getByTestId('timer-toggle').click();

	// Done early, rated 😎 (with a clean BPM where the block has a tempo).
	await page.getByTestId('block-done').click();
	await expect(runner).toHaveAttribute('data-phase', 'rate');
	if (await page.getByTestId('rating-bpm').isVisible())
		await page.getByTestId('rating-bpm').fill('60');
	await page.getByTestId('rate-great').click();

	// The rest: skip one, rate the others.
	for (let i = 2; i < n; i++) {
		await expect(page.getByTestId('session-runner')).toHaveAttribute('data-idx', String(i));
		await page.clock.fastForward('00:40');
		if (i === 2) await page.getByTestId('skip-block').click();
		else {
			await page.getByTestId('block-done').click();
			await page.getByTestId('rate-hard').click();
		}
	}

	const summary = page.getByTestId('session-summary');
	await expect(summary).toBeVisible();
	await expect(page.getByTestId('summary-blocks')).toContainText(`/${n}`);
	const done = Number((await page.getByTestId('summary-blocks').textContent())!.split('/')[0]);
	expect(done).toBe(n > 2 ? n - 1 : n);
	const minutes = Number(await page.getByTestId('summary-minutes').textContent());
	expect(minutes).toBeGreaterThanOrEqual(1);
	await noHorizontalScroll(page);

	// The summary survives a reload; Done goes back to Today, whose ring has the minutes.
	await page.reload();
	await expect(page.getByTestId('session-summary')).toBeVisible();
	await page.getByTestId('summary-done').click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByTestId('weekly-ring')).toHaveAttribute(
		'data-minutes',
		String(minutesBefore + minutes)
	);
	// Done for today: a recap, and "Practise more" for another round.
	await expect(page.getByTestId('done-today')).toBeVisible();
	await page.getByTestId('practise-more').click();
	await expect(page.getByTestId('start-session')).toBeVisible();

	// History: today's bar and the session count.
	// (the last block result may still be on its way)
	await expect
		.poll(
			async () =>
				(await (await page.request.get(`/api/history?date=${today()}`)).json()).days.at(-1).minutes
		)
		.toBe(minutesBefore + minutes);
	await page.getByTestId('progress-link').click();
	await expect(page).toHaveURL(/\/progress$/);
	await expect(page.getByTestId('day-bars-readout')).toHaveText(`${minutesBefore + minutes} min`);
	await expect(page.getByTestId('sessions-total')).not.toHaveText('0');
	await expect(page.getByTestId('skill-level').first()).toBeVisible();
	await noHorizontalScroll(page);
	const hist = await (await page.request.get(`/api/history?date=${today()}`)).json();
	expect(hist.days.at(-1).minutes).toBe(minutesBefore + minutes);
});

test('the weekly goal is edited in a small sheet', async ({ page }) => {
	await page.goto('/');
	await page.getByTestId('goal-settings-open').click();
	const sheet = page.getByTestId('goal-settings');
	await expect(sheet).toBeVisible();
	await sheet.getByRole('button', { name: '3', exact: true }).click();
	await sheet.getByTestId('goal-save').click();
	await expect(sheet).toBeHidden();
	await expect(page.getByTestId('weekly-ring')).toContainText('of 3 days');
	// Back to the default for the other tests.
	await page.request.put('/api/settings', {
		data: { weeklyDays: 5, dailyMin: 15, sessionMin: 15 }
	});
});

test('block results made offline are queued and synced when back online', async ({
	page,
	context
}) => {
	await startFive(page);
	const id = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:session')!).id);
	await context.setOffline(true);
	await page.getByTestId('block-done').click();
	await page.getByTestId('rate-ok').click();
	await expect(page.getByTestId('session-runner')).toHaveAttribute('data-idx', '1');
	await expect
		.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('sg:outbox') ?? '[]').length))
		.toBeGreaterThanOrEqual(1);
	await context.setOffline(false);
	await page.evaluate(() => dispatchEvent(new Event('online')));
	await expect
		.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('sg:outbox') ?? '[]').length))
		.toBe(0);
	const stored = await (await page.request.get(`/api/session/${id}`)).json();
	expect(stored.results[0]).toMatchObject({ rating: 'ok', completed: true });
	// End it so the other project starts clean.
	await page.getByTestId('end-session').click();
	await page.getByTestId('confirm-end').click();
	await expect(page.getByTestId('session-summary')).toBeVisible();
});

test('the runner fits a phone in landscape', async ({ page }) => {
	await page.setViewportSize({ width: 844, height: 390 });
	await startFive(page);
	await expect(page.getByTestId('block-done-short')).toBeInViewport();
	await expect(page.getByTestId('block-done')).toBeHidden();
	await noHorizontalScroll(page);
	await page.getByTestId('end-session').click();
	await page.getByTestId('confirm-end').click();
	await expect(page.getByTestId('session-summary')).toBeVisible();
});

test('a whole session hands-free with a pedal (PageDown = done, → = accept)', async ({ page }) => {
	await page.clock.install();
	const n = await startFive(page);
	const id = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:session')!).id);
	await expect(page.getByTestId('block-do')).not.toBeEmpty();
	// The help lists the keys; while it is open the keys do nothing.
	await page.getByTestId('runner-help-open').click();
	await expect(page.getByTestId('runner-help')).toContainText('PageDown');
	await page.keyboard.press('PageDown');
	await expect(page.getByTestId('session-runner')).toHaveAttribute('data-phase', 'play');
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('runner-help')).toBeHidden();
	for (let i = 0; i < n; i++) {
		await expect(page.getByTestId('session-runner')).toHaveAttribute('data-idx', String(i));
		await page.clock.fastForward('00:30');
		await page.keyboard.press('PageDown');
		await expect(page.getByTestId('rating')).toBeVisible();
		await page.keyboard.press('ArrowRight');
	}
	await expect(page.getByTestId('session-summary')).toBeVisible();
	await expect(page.getByTestId('summary-recap').locator('li')).toHaveCount(n);
	await expect
		.poll(async () => (await (await page.request.get(`/api/session/${id}`)).json()).results)
		.toEqual(
			Array.from({ length: n }, () => expect.objectContaining({ rating: 'ok', completed: true }))
		);
});

test('a session started before midnight resumes after it', async ({ page }) => {
	await page.clock.install({ time: new Date('2026-10-20T23:50:00') });
	await startFive(page);
	const before = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:session')!));
	await page.clock.fastForward('00:30');
	await page.getByTestId('block-done').click();
	await page.getByTestId('rate-ok').click();
	// Away (tab closed) until 00:05 the next day: that time is not counted.
	await page.goto('about:blank');
	await page.clock.fastForward('15:00');
	await page.goto('/session');
	await expect(page.getByTestId('session-runner')).toHaveAttribute('data-idx', '1');
	const after = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:session')!));
	expect(after.id).toBe(before.id);
	expect(after.accMs).toBeLessThan(60_000);
	await page.goto('/');
	await expect(page.getByTestId('resume-session')).toBeVisible();
	await page.getByTestId('resume-session').click();
	await page.getByTestId('end-session').click();
	await page.getByTestId('confirm-end').click();
	await expect(page.getByTestId('session-summary')).toBeVisible();
});
