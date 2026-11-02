import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Both projects share one server/database: reset a song's saved progress before using it.
async function resetProgress(request: APIRequestContext, id: string) {
	const res = await request.put(`/api/songs/${id}/progress`, {
		data: { tempoPct: 100, loopStartBar: null, loopEndBar: null }
	});
	expect(res.ok()).toBe(true);
}

async function openPlayer(page: Page, id: string) {
	await page.goto(`/play/${id}`);
	const player = page.getByTestId('tab-player');
	await expect(player).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
	await expect(player).toHaveAttribute('data-rendered', 'true');
	return player;
}

/** Taps the middle of a bar (0-based index), using the bar bounds the player publishes. */
async function tapBar(page: Page, index: number) {
	const host = page.locator('[data-bar-rects]');
	await expect(host).not.toHaveAttribute('data-bar-rects', '[]');
	const rects: number[][] = JSON.parse((await host.getAttribute('data-bar-rects'))!);
	const [x, y, w, h] = rects[index];
	await host.click({ position: { x: x + w / 2, y: y + h / 2 } });
}

/** Waits for the progress PUT whose body has the given tempo. */
function savedTempo(page: Page, tempoPct: number) {
	return page.waitForResponse(
		(r) =>
			r.url().endsWith('/progress') &&
			r.request().method() === 'PUT' &&
			r.request().postDataJSON()?.tempoPct === tempoPct
	);
}

test('home links to the library, which filters and searches', async ({ page }) => {
	await page.goto('/');
	await page.getByTestId('library-entry').click();
	await expect(page).toHaveURL(/\/library$/);
	const cards = page.getByTestId('song-card');
	await expect(cards).toHaveCount(10);

	await page.getByRole('button', { name: 'blues' }).click();
	await expect(cards).toHaveCount(1);
	await expect(cards.first()).toContainText('Blues');

	await page.getByRole('button', { name: 'All styles' }).click();
	await page.getByRole('button', { name: 'Level 0' }).click();
	await expect(cards).toHaveCount(2);
	await page.getByRole('button', { name: 'All levels' }).click();
	await page.getByPlaceholder('Search songs').fill('green');
	await expect(cards).toHaveCount(1);
	await expect(cards.first()).toContainText('Greensleeves');
	await expect(cards.first()).toContainText('Level 3');
});

test('player renders the tab and plays/pauses', async ({ page }) => {
	await page.goto('/library');
	await page.getByTestId('song-card').filter({ hasText: 'Ode to Joy' }).click();
	await expect(page).toHaveURL(/\/play\/ode-to-joy$/);

	const player = page.getByTestId('tab-player');
	await expect(player).toHaveAttribute('data-rendered', 'true', { timeout: 20_000 });
	await expect(page.locator('.at-surface svg, .at-surface canvas').first()).toBeVisible();

	const play = page.getByTestId('play-button');
	await expect(player).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
	await play.click();
	await expect(play).toHaveAttribute('data-playing', 'true');
	await play.click();
	await expect(play).toHaveAttribute('data-playing', 'false');
});

test('tempo changes persist after reload', async ({ page, request }) => {
	await resetProgress(request, 'scarborough-fair');
	await page.goto('/play/scarborough-fair');
	await expect(page.getByTestId('tempo-value')).toHaveText('100%');
	const saved = savedTempo(page, 90);
	await page.getByRole('button', { name: 'Slower' }).click();
	await page.getByRole('button', { name: 'Slower' }).click();
	await expect(page.getByTestId('tempo-value')).toHaveText('90%');
	expect((await saved).ok()).toBe(true);

	await page.reload();
	await expect(page.getByTestId('tempo-value')).toHaveText('90%');
});

test('tempo presets set the tempo in one tap', async ({ page, request }) => {
	await resetProgress(request, 'amazing-grace');
	await page.goto('/play/amazing-grace');
	const saved = savedTempo(page, 60);
	await page.getByRole('button', { name: 'Tempo 60%' }).click();
	await expect(page.getByTestId('tempo-value')).toHaveText('60%');
	await expect(page.getByRole('button', { name: 'Tempo 60%' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	expect((await saved).ok()).toBe(true);
});

test('bar label follows tap-to-seek and stop', async ({ page }) => {
	await openPlayer(page, 'ode-to-joy');
	const status = page.getByTestId('bar-status');
	await expect(status).toHaveText('Bar 1/16');
	await tapBar(page, 2);
	await expect(status).toHaveText('Bar 3/16');
	await page.getByRole('button', { name: 'Stop' }).click();
	await expect(status).toHaveText('Bar 1/16');
});

test('loop is picked by tapping two bars and restored on reload', async ({ page, request }) => {
	await resetProgress(request, 'house-of-the-rising-sun');
	await openPlayer(page, 'house-of-the-rising-sun');

	await page.getByTestId('loop-button').click();
	await expect(page.getByTestId('loop-hint')).toBeVisible();
	await tapBar(page, 0);
	await expect(page.getByTestId('loop-hint')).toContainText('last bar');
	const saved = page.waitForResponse(
		(r) =>
			r.url().endsWith('/progress') &&
			r.request().method() === 'PUT' &&
			r.request().postDataJSON()?.loopEndBar === 1
	);
	await tapBar(page, 1);
	await expect(page.getByTestId('loop-status')).toHaveText('Loop: bars 1–2');
	expect((await saved).ok()).toBe(true);

	await page.reload();
	await expect(page.getByTestId('loop-status')).toHaveText('Loop: bars 1–2');
});

test('controls fit the viewport with touch-sized targets', async ({ page }) => {
	await page.goto('/play/blues-in-e-shuffle');
	const controls = page.getByTestId('controls');
	await expect(controls).toBeInViewport();
	const viewport = page.viewportSize()!;
	for (const button of await controls.getByRole('button').all()) {
		const b = (await button.boundingBox())!;
		expect(b.width).toBeGreaterThanOrEqual(44);
		expect(b.height).toBeGreaterThanOrEqual(44);
		expect(b.x + b.width).toBeLessThanOrEqual(viewport.width);
	}
	// No horizontal page scroll; only the tab viewport scrolls.
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
	expect(overflow).toBeLessThanOrEqual(0);
});

test('mixer lists tracks and toggles mute without blocking play', async ({ page }) => {
	await openPlayer(page, 'ode-to-joy');
	await page.getByTestId('mixer-button').click();
	await expect(page.getByTestId('mixer-track')).toHaveCount(2);
	const mute = page.getByRole('button', { name: 'Mute Chords' });
	await mute.click();
	await expect(mute).toHaveAttribute('aria-pressed', 'true');
	// The mixer is not modal: transport stays usable.
	const play = page.getByTestId('play-button');
	await play.click();
	await expect(play).toHaveAttribute('data-playing', 'true');
	await play.click();
});

test('home shows a Continue card for the last played song', async ({ page, request }) => {
	await request.put('/api/songs/minuet-in-g/progress', {
		data: { tempoPct: 75, loopStartBar: 2, loopEndBar: 5, played: true }
	});
	await page.goto('/');
	const card = page.getByTestId('continue-card');
	await expect(card).toContainText('Minuet in G');
	await expect(card).toContainText('Tempo 75%');
	await expect(card).toContainText('Loop bars 3–6');
	await card.click();
	await expect(page).toHaveURL(/\/play\/minuet-in-g$/);
});
