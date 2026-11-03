// M5 in the static demo: the Library's tabs, a chord sheet, a warm-up routine, an imported tab,
// and the session's warm-up block planned from the routines (all in the browser, no server).
import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
	await expect(page.getByTestId('tab-player')).toHaveAttribute('data-ready', 'true', {
		timeout: 30_000
	});
}

test('library tabs and filters', async ({ page }) => {
	await page.goto('library');
	await page.getByTestId('filter-kind').selectOption('sheet');
	await expect(page.getByTestId('song-card').first()).toHaveAttribute('data-kind', 'sheet');
	await page.getByTestId('tab-warmups').click();
	await expect(page).toHaveURL(/library\?(.*&)?tab=warmups$/);
	await expect(page.getByTestId('warmup-card').first()).toBeVisible();
	await page.getByTestId('tab-exercises').click();
	await expect(page.getByTestId('exercise-card').first()).toBeVisible();
});

test('a chord sheet plays, lights up its line and transposes', async ({ page }) => {
	await page.goto('play/swing-low-sweet-chariot');
	await expect(page.getByTestId('sheet-line').first()).toContainText('Swing low');
	await expect(page.getByTestId('chord-bar').getByTestId('chord-mini')).toHaveCount(3);
	await ready(page);
	await page.getByTestId('play-button').click();
	await expect(page.locator('[data-testid=sheet-line][data-current=true]')).toHaveCount(1, {
		timeout: 10_000
	});
	await page.getByTestId('play-button').click();
	await page.getByTestId('transpose-down').click();
	await expect(page.getByTestId('sheet-key')).toContainText('F#');
});

test('a warm-up routine runs to done', async ({ page }) => {
	await page.goto('warmups/strum-quarters-to-eighths');
	await page.getByTestId('warmup-start').click();
	await expect(page.getByTestId('strum')).toBeVisible();
	for (let i = 0; i < 3; i++) await page.getByTestId('warmup-next').click();
	await expect(page.getByTestId('warmup-done')).toBeVisible();
});

test('an imported tab plays', async ({ page }) => {
	await page.goto('play/carulli-waltz-op241-01');
	await ready(page);
	await page.getByTestId('play-button').click();
	await expect(page.getByTestId('play-button')).toHaveAttribute('data-playing', 'true');
	await page.getByTestId('play-button').click();
});

test('with some history, the session warm-up is a routine', async ({ page }) => {
	await page.goto('about/attributions');
	await page.getByTestId('demo-load-sample').click();
	await expect(page.getByTestId('demo-message')).toContainText('Sample loaded', {
		timeout: 30_000
	});
	await page.goto('./');
	const first = page.getByTestId('plan-block').first();
	await expect(first).toHaveAttribute('data-kind', 'warmup');
	await expect(first).toHaveAttribute('data-target', 'warmup');
});

test('the demo loads a small index, and a song only when it is opened', async ({ page }) => {
	const json: string[] = [];
	page.on('request', (r) => {
		const name = new URL(r.url()).pathname.split('/').pop()!;
		if (name.endsWith('.json') && !name.endsWith('manifest.json')) json.push(name);
	});
	await page.goto('library?level=all');
	await expect(page.getByTestId('song-card').first()).toBeVisible();
	// The index only: no full content file, no song's score.
	expect(json.length).toBeGreaterThan(0);
	for (const name of json) expect(name).toMatch(/^content-index\.[\w-]+\.json$/);
	json.length = 0;
	await page.getByTestId('song-card').filter({ hasText: 'Amazing Grace' }).click();
	await expect(page.getByTestId('sheet')).toBeVisible();
	expect(json.some((n) => /^amazing-grace\.[\w-]+\.json$/.test(n))).toBe(true);
	// Today names the last song played without the song list.
	await ready(page);
	await page.getByTestId('play-button').click();
	await expect(page.getByTestId('play-button')).toHaveAttribute('data-playing', 'true');
	await page.getByTestId('play-button').click();
	json.length = 0;
	await page.goto('./');
	await expect(page.getByTestId('continue-card')).toContainText('Amazing Grace');
	expect(json.filter((n) => !n.startsWith('content-index'))).toEqual([]);
});
