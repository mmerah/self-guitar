// The static demo: the whole app runs in the browser (SQLite/WASM in IndexedDB) under the
// GitHub Pages base path. Every test starts with an empty browser profile (its own IndexedDB).
import { expect, test as base, type Page } from '@playwright/test';

const BASE = '/self-guitar/';

/** Fails a test on any request outside the base path, any /api request, or any 4xx/5xx. */
const test = base.extend<{ watch: void }>({
	watch: [
		async ({ page }, use) => {
			const problems: string[] = [];
			page.on('request', (r) => {
				const url = new URL(r.url());
				if (url.hostname !== 'localhost') return;
				if (!url.pathname.startsWith(BASE)) problems.push(`outside base: ${r.url()}`);
				if (url.pathname.includes('/api/')) problems.push(`api request: ${r.url()}`);
			});
			page.on('response', (r) => {
				if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`);
			});
			page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
			await use();
			expect(problems).toEqual([]);
		},
		{ auto: true }
	]
});

async function loadSample(page: Page) {
	await page.goto('about/attributions');
	await page.getByTestId('demo-load-sample').click();
	await expect(page.getByTestId('demo-message')).toHaveText(
		'Sample loaded: about 2 weeks in, Level 1',
		{ timeout: 30_000 }
	);
}

test('demo banner, Today → a 5-minute session → summary', async ({ page }) => {
	await page.clock.install();
	await page.goto('./');
	await expect(page.getByTestId('demo-banner')).toContainText('Progress stays in this browser');
	await expect(page.getByTestId('start-card')).toHaveAttribute('data-ready', 'true');
	await page.getByTestId('length-5').click();
	await expect(page.getByTestId('start-session')).toHaveText(/Start 5-min session/);
	await expect(page.getByTestId('plan')).toHaveAttribute('data-source', 'server');
	const n = await page.getByTestId('plan-block').count();
	expect(n).toBeGreaterThanOrEqual(2);
	await page.getByTestId('start-session').click();
	await expect(page).toHaveURL(/\/self-guitar\/session$/);
	const runner = page.getByTestId('session-runner');
	for (let i = 0; i < n; i++) {
		await expect(runner).toHaveAttribute('data-idx', String(i));
		await page.clock.fastForward('01:00');
		await page.getByTestId('block-done').click();
		await page.getByTestId('rate-ok').click();
	}
	await expect(page.getByTestId('session-summary')).toBeVisible();
	await expect(page.getByTestId('summary-blocks')).toHaveText(`${n}/${n}`);
	await page.getByTestId('summary-done').click();
	await expect(page).toHaveURL(/\/self-guitar\/$/);
	await expect(page.getByTestId('done-today')).toBeVisible();
	// Stored in the browser's database: the session is still today's after a reload.
	await page.reload();
	await expect(page.getByTestId('done-today')).toBeVisible();
});

test('Learn → a lesson → the tempo ladder (stored across reloads)', async ({ page }) => {
	await page.goto('learn');
	await page.getByTestId('learn-continue').click();
	await expect(page.getByTestId('lesson')).toBeVisible();
	await expect(page).toHaveURL(/\/self-guitar\/learn\/[a-z0-9-]+$/);

	await page.goto('learn/first-strum');
	await page.getByTestId('exercise-practice').first().click();
	await expect(page).toHaveURL(/\/self-guitar\/practice\/exercise\/[a-z0-9-]+\?from=first-strum$/);
	const ladder = page.getByTestId('ladder');
	await expect(ladder).toHaveAttribute('data-streak', '0');
	await page.getByTestId('ladder-clean').click();
	await expect(ladder).toHaveAttribute('data-streak', '1');
	await page.reload();
	await expect(page.getByTestId('ladder')).toHaveAttribute('data-streak', '1');
});

test('1-minute changes: a result is saved', async ({ page }) => {
	await page.clock.install();
	await page.goto('tools/changes');
	await page.getByLabel('First chord').selectOption('E');
	await page.getByLabel('Second chord').selectOption('Am');
	await page.getByTestId('changes-start').click();
	await page.clock.runFor(3_200);
	await expect(page.getByTestId('changes-session')).toHaveAttribute('data-phase', 'running');
	await page.clock.runFor(61_000);
	await expect(page.getByTestId('changes-session')).toHaveAttribute('data-phase', 'done');
	await page.getByTestId('changes-count-input').fill('27');
	await page.getByTestId('changes-save').click();
	await expect(page.getByTestId('saved-result')).toContainText('Saved: 27 changes');
	await page.clock.runFor(1_000);
	await page.reload();
	await expect(page.getByTestId('pair-best')).toContainText('27');
});

test('sample progress fills Today and Progress, and survives reloads', async ({ page }) => {
	await page.goto('progress');
	await expect(page.getByTestId('progress-empty')).toBeVisible();
	await loadSample(page);
	await page.reload();
	await page.goto('progress');
	await expect(page.getByTestId('sessions-total')).not.toHaveText('0');
	await expect(page.getByTestId('pair-records').locator('li')).not.toHaveCount(0);
	await page.goto('./');
	await expect(page.getByTestId('weekly-ring')).not.toHaveAttribute('data-minutes', '0');
	await expect(page.getByTestId('continue-card')).toBeVisible();
});

test('the player renders and plays', async ({ page }) => {
	await page.goto('library');
	await page.getByTestId('song-card').filter({ hasText: 'Ode to Joy' }).click();
	await expect(page).toHaveURL(/\/self-guitar\/play\/ode-to-joy$/);
	const player = page.getByTestId('tab-player');
	await expect(player).toHaveAttribute('data-rendered', 'true', { timeout: 20_000 });
	await expect(player).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
	const play = page.getByTestId('play-button');
	await play.click();
	await expect(play).toHaveAttribute('data-playing', 'true');
	await play.click();
	await expect(play).toHaveAttribute('data-playing', 'false');
});

test('the tuner page loads', async ({ page }) => {
	await page.goto('tools/tuner');
	await expect(page.getByTestId('tuner-toggle')).toBeVisible();
	await expect(page.getByTestId('tuner-readout')).toHaveAttribute('data-status', 'idle');
});

test('deep links are real pages (no 404 fallback)', async ({ page }) => {
	for (const path of ['learn/chord-e', 'play/drunken-sailor', 'tools/metronome', 'progress']) {
		const res = await page.goto(path);
		expect(res?.status(), path).toBe(200);
	}
});

test.describe('offline', () => {
	test.use({ serviceWorkers: 'allow' });

	test('works offline after the first load', async ({ page, context }) => {
		await page.goto('./');
		await page.evaluate(async () => {
			await navigator.serviceWorker.ready;
		});
		// Controlled by the worker once the precache is in place.
		await page.reload();
		await expect
			.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 })
			.toBe(true);
		// A song's own file is cached when it is first opened (the precache holds the index).
		await page.goto('play/drunken-sailor');
		await expect(page.getByTestId('sheet')).toBeVisible();
		await context.setOffline(true);
		await page.goto('learn/chord-e');
		await expect(page.getByTestId('lesson')).toBeVisible();
		await page.goto('./');
		await expect(page.getByTestId('plan')).toHaveAttribute('data-source', 'server');
		await page.goto('play/drunken-sailor');
		await expect(page.getByTestId('tab-player')).toHaveAttribute('data-rendered', 'true', {
			timeout: 20_000
		});
		await context.setOffline(false);
	});
});

test('Reset demo data clears everything', async ({ page }) => {
	await loadSample(page);
	page.on('dialog', (d) => void d.accept());
	// The page reloads once the data is gone.
	await Promise.all([page.waitForEvent('load'), page.getByTestId('demo-reset').click()]);
	await page.goto('progress');
	await expect(page.getByTestId('progress-empty')).toBeVisible();
});

test('the banner folds into a Demo chip that opens it again', async ({ page }) => {
	await page.goto('./');
	const banner = page.getByTestId('demo-banner');
	await expect(banner).toBeVisible();
	// One slim line on first visit.
	expect((await banner.boundingBox())!.height).toBeLessThanOrEqual(37);
	await page.getByTestId('demo-dismiss').click();
	await expect(banner).toBeHidden();
	await page.reload();
	await expect(page.getByTestId('demo-chip')).toBeVisible();
	await page.getByTestId('demo-chip').click();
	await expect(banner).toBeVisible();
	await expect(banner.getByTestId('demo-banner-reset')).toHaveText('Reset data…');
	await expect(banner.getByTestId('demo-sample')).toBeVisible();
});

test('a short landscape screen shows the chip instead of the banner', async ({ page }) => {
	await page.setViewportSize({ width: 844, height: 390 });
	await page.goto('library');
	await expect(page.getByTestId('demo-banner')).toBeHidden();
	await expect(page.getByTestId('demo-chip')).toBeVisible();
});

test('an exercise shows what to play; Listen records nothing; zoom persists', async ({ page }) => {
	await page.goto('practice/exercise/eighth-strums-g-c');
	const strip = page.getByTestId('what-to-play');
	await expect(strip.getByTestId('how-to')).not.toBeEmpty();
	await expect(strip.getByTestId('chord-mini')).toHaveCount(3);
	await expect(page.getByTestId('strum-row').locator('li')).toHaveCount(8);
	const player = page.getByTestId('tab-player');
	await expect(player).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
	await page.getByTestId('listen-button').click();
	await expect(player).toHaveAttribute('data-listening', 'true');
	await page.getByTestId('listen-button').click();
	await expect(player).toHaveAttribute('data-listening', 'false');
	await expect(page.getByTestId('ladder')).toHaveAttribute('data-streak', '0');

	await page.goto('play/ode-to-joy');
	await expect(player).toHaveAttribute('data-rendered', 'true', { timeout: 20_000 });
	await expect(player).toHaveAttribute('data-scale', '1');
	await page.getByTestId('zoom-in').click();
	await expect(player).toHaveAttribute('data-scale', '1.1');
	await page.reload();
	await expect(player).toHaveAttribute('data-scale', '1.1');
});
