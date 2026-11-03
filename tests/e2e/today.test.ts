import { spawn } from 'node:child_process';
import net from 'node:net';
import { expect, test as base, type Page } from '@playwright/test';

// Each test gets its own server and empty database, so the plans do not depend on what earlier
// tests (or the other project) recorded, nor on the order the tests run in. The block timers run
// on Playwright's fake clock, pinned to a fixed day where the date matters.

const freePort = () =>
	new Promise<number>((resolve, reject) => {
		const srv = net.createServer();
		srv.unref();
		srv.on('error', reject);
		srv.listen(0, () => {
			const { port } = srv.address() as net.AddressInfo;
			srv.close(() => resolve(port));
		});
	});

const test = base.extend({
	// Playwright reads a fixture's dependencies from the destructuring: this one has none.
	// eslint-disable-next-line no-empty-pattern
	baseURL: async ({}, use, testInfo) => {
		const port = await freePort();
		const url = `http://localhost:${port}`;
		const server = spawn(process.execPath, ['build'], {
			env: { ...process.env, PORT: String(port), DATA_DIR: testInfo.outputPath('data') },
			stdio: 'ignore'
		});
		try {
			await expect
				.poll(
					() =>
						fetch(`${url}/api/health`).then(
							(r) => r.ok,
							() => false
						),
					{ timeout: 15_000 }
				)
				.toBe(true);
			await use(url);
		} finally {
			server.kill();
		}
	}
});

/** A fixed local day (any time zone): the history and ring queries use it. */
const DAY = '2026-06-15';

async function noHorizontalScroll(page: Page) {
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
	expect(overflow).toBeLessThanOrEqual(0);
}

/**
 * Picks a length on Today and starts that plan. Returns the session's block count, after
 * checking that the session runs exactly the blocks the (settled) preview showed.
 */
async function startSession(page: Page, minutes: number) {
	await page.goto('/');
	await expect(page.getByTestId('start-card')).toHaveAttribute('data-ready', 'true');
	await page.getByTestId('length-' + minutes).click();
	const plan = page.getByTestId('plan');
	// The preview is the plan for this length, not the one it replaces.
	await expect(plan).toHaveAttribute('data-minutes', String(minutes));
	await expect(plan).toHaveAttribute('aria-busy', 'false');
	await expect(plan).toHaveAttribute('data-source', 'server');
	await expect(page.getByTestId('start-session')).toHaveText(`Start ${minutes}-min session`);
	const previewed = await page.getByTestId('plan-block-title').allTextContents();
	await page.getByTestId('start-session').click();
	await expect(page).toHaveURL(/\/session$/);
	await expect(page.getByTestId('session-runner')).toHaveAttribute('data-idx', '0');
	const session = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:session')!));
	expect(session.plannedMin).toBe(minutes);
	expect(session.blocks.map((b: { title: string }) => b.title)).toEqual(previewed);
	return session.blocks.length as number;
}

test('a session from Today: blocks, ratings, reload, summary, history and ring', async ({
	page
}) => {
	await page.clock.install({ time: new Date(`${DAY}T10:00:00`) });
	await page.goto('/');
	const ring = page.getByTestId('weekly-ring');
	await expect(ring).toBeVisible();
	const minutesBefore = Number(await ring.getAttribute('data-minutes'));
	await noHorizontalScroll(page);

	// 15 minutes: enough blocks to rate, skip and rate again.
	const n = await startSession(page, 15);
	expect(n).toBeGreaterThanOrEqual(3);
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
	expect(done).toBe(n - 1);
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
				(await (await page.request.get(`/api/history?date=${DAY}`)).json()).days.at(-1).minutes
		)
		.toBe(minutesBefore + minutes);
	await page.getByTestId('progress-link').click();
	await expect(page).toHaveURL(/\/progress$/);
	await expect(page.getByTestId('day-bars-readout')).toHaveText(`${minutesBefore + minutes} min`);
	await expect(page.getByTestId('sessions-total')).not.toHaveText('0');
	await expect(page.getByTestId('skill-level').first()).toBeVisible();
	await noHorizontalScroll(page);
	const hist = await (await page.request.get(`/api/history?date=${DAY}`)).json();
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
});

test('block results made offline are queued and synced when back online', async ({
	page,
	context
}) => {
	await startSession(page, 5);
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
	await page.getByTestId('end-session').click();
	await page.getByTestId('confirm-end').click();
	await expect(page.getByTestId('session-summary')).toBeVisible();
});

test('the runner fits a phone in landscape', async ({ page }) => {
	await page.setViewportSize({ width: 844, height: 390 });
	await startSession(page, 5);
	await expect(page.getByTestId('block-done-short')).toBeInViewport();
	await expect(page.getByTestId('block-done')).toBeHidden();
	await noHorizontalScroll(page);
	await page.getByTestId('end-session').click();
	await page.getByTestId('confirm-end').click();
	await expect(page.getByTestId('session-summary')).toBeVisible();
});

test('a whole session hands-free with a pedal (PageDown = done, → = accept)', async ({ page }) => {
	await page.clock.install({ time: new Date(`${DAY}T10:00:00`) });
	// 15 minutes: a tool, a lesson, an exercise and a song, each done and accepted by the pedal.
	const n = await startSession(page, 15);
	expect(n).toBeGreaterThanOrEqual(3);
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
		if (i === n - 1) break;
		// One block per press: past the 5 s auto-accept the next block is still playing.
		const runner = page.getByTestId('session-runner');
		await expect(runner).toHaveAttribute('data-idx', String(i + 1));
		await page.clock.fastForward('00:10');
		await expect(runner).toHaveAttribute('data-idx', String(i + 1));
		await expect(runner).toHaveAttribute('data-phase', 'play');
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
	await startSession(page, 5);
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

test('a quick change of length starts only once the plan for the new length is in', async ({
	page
}) => {
	// The 5-minute plan answers first, the 20-minute one later: the answer for 5 must not end the
	// loading while the preview still shows the old plan under "Start 20-min session".
	const delays: Record<string, number> = { '5': 300, '20': 1500 };
	await page.route('**/api/session/plan?*', async (route) => {
		const m = new URL(route.request().url()).searchParams.get('minutes')!;
		await new Promise((r) => setTimeout(r, delays[m] ?? 0));
		await route.continue();
	});
	await page.goto('/');
	await expect(page.getByTestId('start-card')).toHaveAttribute('data-ready', 'true');
	const plan = page.getByTestId('plan');
	const start = page.getByTestId('start-session');
	const before = await plan.getAttribute('data-minutes');
	expect(before).not.toBe('5');
	expect(before).not.toBe('20');
	const five = page.waitForResponse((r) => r.url().includes('minutes=5&'));
	await page.getByTestId('length-5').click();
	await page.getByTestId('length-20').click();
	await five;
	await page.waitForTimeout(300);
	await expect(start).toHaveText('Start 20-min session');
	await expect(start).toBeDisabled();
	await expect(plan).toHaveAttribute('data-minutes', before!);
	await expect(plan).toHaveAttribute('aria-busy', 'true');
	// The 20-minute plan arrives: shown, and startable.
	await expect(plan).toHaveAttribute('data-minutes', '20');
	await expect(start).toBeEnabled();
	await expect(plan).toHaveAttribute('aria-busy', 'false');
	const titles = await page.getByTestId('plan-block-title').allTextContents();
	await start.click();
	await expect(page).toHaveURL(/\/session$/);
	const session = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:session')!));
	expect(session.plannedMin).toBe(20);
	expect(session.blocks.map((b: { title: string }) => b.title)).toEqual(titles);
});
