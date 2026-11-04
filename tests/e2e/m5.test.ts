import { expect, test, type Page } from '@playwright/test';

// M5: the Library's tabs, chord sheets (lyrics, chord bar, playback highlight, transpose),
// warm-up routines and an imported tab.

type Summary = { id: string; kind: 'tab' | 'sheet'; hasTab: boolean; style: string };

async function waitReady(page: Page) {
	await expect(page.getByTestId('tab-player')).toHaveAttribute('data-ready', 'true', {
		timeout: 30_000
	});
}

test('library: Songs, Warm-ups and Exercises tabs, kept in the URL, with filters', async ({
	page
}) => {
	const songs = (await (await page.request.get('/api/songs')).json()) as Summary[];
	const index = (await (await page.request.get('/api/learn')).json()) as {
		exercises: unknown[];
		warmups: { level: number }[];
		lessons: { level: number }[];
	};
	await page.goto('/library?level=all');
	const cards = page.getByTestId('song-card');
	await expect(cards).toHaveCount(songs.length);
	await page.getByTestId('filter-kind').selectOption('sheet');
	await expect(cards).toHaveCount(songs.filter((s) => s.kind === 'sheet').length);
	await expect(cards.first()).toHaveAttribute('data-kind', 'sheet');
	await page.getByTestId('filter-kind').selectOption('tab');
	await expect(cards).toHaveCount(songs.filter((s) => s.hasTab).length);
	await page.getByTestId('filter-kind').selectOption('all');
	await page.getByTestId('filter-style').selectOption('spiritual');
	await expect(cards).toHaveCount(songs.filter((s) => s.style === 'spiritual').length);
	await page.getByTestId('filter-style').selectOption('all');
	// Search finds a chord sheet by a chord it uses.
	await page.getByPlaceholder('Search songs').fill('G7');
	await expect(cards.filter({ hasText: 'Amazing Grace' })).toHaveCount(1);
	await page.getByPlaceholder('Search songs').fill('');
	await page.getByTestId('sort').selectOption('title');
	const titles = await cards.getByTestId('song-title').allTextContents();
	expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));

	await page.getByTestId('tab-warmups').click();
	await expect(page).toHaveURL(/[?&]tab=warmups$/);
	await expect(page.getByTestId('tab-warmups')).toHaveAttribute('aria-selected', 'true');
	// Routines more than one level past the last level with lessons wait behind "later".
	const top = Math.max(...index.lessons.map((l) => l.level));
	const later = index.warmups.filter((w) => w.level > top + 1).length;
	await expect(page.getByTestId('warmup-card')).toHaveCount(index.warmups.length - later);
	if (later) {
		await page.getByTestId('warmups-later').click();
		await expect(page.getByTestId('warmup-card')).toHaveCount(index.warmups.length);
	} else await expect(page.getByTestId('warmups-later')).toHaveCount(0);

	await page.reload();
	await expect(page.getByTestId('tab-warmups')).toHaveAttribute('aria-selected', 'true');
	await page.getByTestId('tab-exercises').click();
	await expect(page).toHaveURL(/[?&]tab=exercises$/);
	await expect(page.getByTestId('exercise-card')).toHaveCount(index.exercises.length);
	await page.getByTestId('exercise-card').first().click();
	await expect(page).toHaveURL(/\/practice\/exercise\//);
});

test('a chord sheet: lyrics, chord bar, playback highlights the line, transpose', async ({
	page
}) => {
	await page.goto('/play/drunken-sailor');
	const sheet = page.getByTestId('sheet');
	await expect(sheet).toBeVisible();
	await expect(page.getByTestId('sheet-line').first()).toContainText('drunken sailor');
	const bar = page.getByTestId('chord-bar');
	await expect(bar.getByTestId('chord-mini')).toHaveCount(2);
	await expect(bar.locator('[data-chord="Em"] svg')).toBeVisible();
	await expect(page.getByTestId('strum-row')).toBeVisible();

	// Tap a chorus line: playback starts there and the line lights up.
	await waitReady(page);
	const line = page.locator('[data-line="1-1"]');
	await line.click();
	await page.getByTestId('play-button').click();
	await expect(page.getByTestId('play-button')).toHaveAttribute('data-playing', 'true');
	await expect(page.locator('[data-testid=sheet-line][data-current=true]')).toHaveCount(1, {
		timeout: 10_000
	});
	await expect(bar.locator('[data-current=true]')).toHaveCount(1);
	await page.getByTestId('play-button').click();

	// Transpose up two semitones: Em → F#m everywhere (names, diagrams, accompaniment).
	await page.getByTestId('transpose-up').click();
	await page.getByTestId('transpose-up').click();
	await expect(page.getByTestId('sheet-key')).toContainText('F#m');
	await expect(sheet).toHaveAttribute('data-transpose', '2');
	await expect(bar.locator('[data-chord="F#m"]')).toBeVisible();
	await expect(bar.locator('[data-chord="E"]')).toBeVisible();
	await expect(page.getByTestId('sheet-line').first()).toContainText('F#m');
	await waitReady(page);
	await page.getByTestId('sheet-key').click();
	await expect(page.getByTestId('sheet-key')).toContainText('Em');
});

test('a song with both: chords and its tab, one tap apart', async ({ page }) => {
	await page.goto('/play/scarborough-fair');
	await expect(page.getByTestId('sheet')).toBeVisible();
	await page.getByTestId('view-tab').click();
	await expect(page).toHaveURL(/view=tab/);
	await expect(page.getByTestId('sheet')).toHaveCount(0);
	await expect(page.getByTestId('tab-player')).toHaveAttribute('data-rendered', 'true', {
		timeout: 20_000
	});
});

test('a warm-up routine runs from start to done', async ({ page }) => {
	await page.goto('/library?tab=warmups');
	await page.getByTestId('warmup-card').filter({ hasText: 'Two-minute hand stretch' }).click();
	await expect(page).toHaveURL(/\/warmups\/hand-stretches$/);
	const runner = page.getByTestId('warmup-runner');
	await expect(runner).toHaveAttribute('data-phase', 'intro');
	await page.getByTestId('warmup-start').click();
	await expect(runner).toHaveAttribute('data-phase', 'run');
	await expect(page.getByTestId('warmup-stretch')).toBeVisible();
	await expect(page.getByTestId('warmup-timer')).toHaveText(/^0:1\d$/);
	const steps = await page.getByTestId('warmup-step-label').textContent();
	const n = Number(/\/(\d+)/.exec(steps!)![1]);
	for (let i = 0; i < n; i++) {
		await expect(runner).toHaveAttribute('data-step', String(i));
		await page.getByTestId('warmup-next').click();
	}
	await expect(page.getByTestId('warmup-done')).toBeVisible();
	await expect(page.getByTestId('warmup-summary')).toContainText(`${n} of ${n} steps`);
});

test('a warm-up step with a tab plays at the routine tempo', async ({ page }) => {
	await page.goto('/warmups/changes-em-am-drill');
	await page.getByTestId('warmup-start').click();
	await expect(page.getByTestId('what-to-play')).toContainText('Em for two beats');
	await expect(page.getByTestId('chord-mini')).toHaveCount(2);
	await expect(page.getByTestId('tempo-value')).toHaveText('50 BPM');
	await expect(page.getByTestId('strum-row')).toBeVisible();
});

test('an imported tab opens and plays', async ({ page }) => {
	await page.goto('/library?level=all');
	await page.getByTestId('song-card').filter({ hasText: 'Lesson No. 1, Op. 60' }).click();
	await expect(page).toHaveURL(/\/play\/sor-op60-01$/);
	await waitReady(page);
	await expect(page.locator('.at-surface svg').first()).toBeVisible();
	await page.getByTestId('play-button').click();
	await expect(page.getByTestId('play-button')).toHaveAttribute('data-playing', 'true');
	await expect(page.getByTestId('bar-status')).toHaveText(/Bar \d+\/16/);
	await page.getByTestId('play-button').click();
	await expect(page.getByTestId('play-button')).toHaveAttribute('data-playing', 'false');
});
