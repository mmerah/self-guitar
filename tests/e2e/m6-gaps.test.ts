import { expect, test } from '@playwright/test';

// M6 content gaps: picked voicings (the full barre F), 16th-note strum rows, H / P labels on
// legato, alternate-tuning exercises and the extended chord library.

test('the full-F exercise shows the barre F, and its changes link opens on it', async ({
	page
}) => {
	await page.goto('/practice/exercise/c-am-f-g-full-f');
	const f = page.locator('[data-testid=chord-mini][data-chord=F]');
	await expect(f).toHaveAttribute('data-voicing', '1-3-3-2-1-1');
	// No tuning notice for a standard-tuning exercise.
	await expect(page.getByTestId('tuning-notice')).toHaveCount(0);

	await page.goto('/learn/full-f-chord');
	const link = page.locator('[data-testid=tool-link][data-tool=changes]');
	await expect(link).toContainText('C – F (E-shape barre)');
	await link.click();
	await expect(page).toHaveURL(/\/tools\/changes\?a=C&b=F%401-3-3-2-1-1/);
	const cards = page.getByTestId('pair-diagrams').getByTestId('chord-card');
	await expect(cards.nth(1)).toHaveAttribute('data-chord', 'F');
	await expect(cards.nth(1)).toHaveAttribute('data-voicing', '1-3-3-2-1-1');
	await expect(cards.nth(0)).toHaveAttribute('data-voicing', 'x-3-2-0-1-0');
});

test('16th-note strums: lesson widget and the ladder strum row', async ({ page }) => {
	await page.goto('/learn/sixteenth-grooves');
	const strum = page.getByTestId('strum').first();
	await expect(strum).toHaveAttribute('data-sub', '16');
	await expect(strum).toContainText('16ths');
	const counts = strum.getByTestId('strum-count');
	await expect(counts).toHaveCount(16);
	await expect(counts.nth(0)).toHaveText('1');
	await expect(counts.nth(1)).toHaveText('e');
	await expect(counts.nth(2)).toHaveText('&');
	await expect(counts.nth(3)).toHaveText('a');
	await expect(counts.nth(4)).toHaveText('2');

	await page.goto('/practice/exercise/sixteenth-groove');
	const row = page.getByTestId('strum-row');
	await expect(row).toHaveAttribute('data-sub', '16');
	await expect(row.locator('li')).toHaveCount(16);
	await expect(row.getByTestId('strum-row-count').nth(3)).toHaveText('a');
	await expect(row).toHaveAttribute('aria-label', /^Strum \(16ths\): down, miss, down, up, down/);
	// The syncopated exercise: two bars of 16ths, one row per bar.
	await page.goto('/practice/exercise/syncopated-sixteenths');
	await expect(page.getByTestId('strum-row').locator('ol')).toHaveCount(2);
	await expect(page.getByTestId('strum-row').locator('li')).toHaveCount(32);
});

test('hammer-ons and pull-offs are labelled H and P on the tab', async ({ page }) => {
	await page.goto('/practice/exercise/hammer-pull-slide-box-1');
	const tab = page.locator('.at-surface');
	await expect(tab.locator('text', { hasText: /^H$/ }).first()).toBeVisible({ timeout: 20_000 });
	await expect(tab.locator('text', { hasText: /^P$/ }).first()).toBeVisible();
});

test('an exercise in DADGAD says retune first and links the tuner', async ({ page }) => {
	await page.goto('/practice/exercise/dadgad-drone');
	const notice = page.getByTestId('tuning-notice');
	await expect(notice).toContainText('Tuning: DADGAD — retune first');
	await expect(notice).toContainText('D A D G A D');
	await expect(notice).toHaveAttribute('data-tuning', 'dadgad');
	await notice.click();
	await expect(page).toHaveURL(/\/tools\/tuner\?tuning=dadgad/);
	await expect(page.getByTestId('tuning-select')).toHaveValue('dadgad');

	await page.goto('/practice/exercise/open-g-slide');
	await expect(page.getByTestId('tuning-notice')).toContainText('Tuning: Open G');
});

test('chords tool: maj7 and m7b5 qualities, alias search', async ({ page }) => {
	await page.goto('/tools/chords');
	await page.getByRole('button', { name: 'Barre / all' }).click();
	await page.getByRole('button', { name: 'm7♭5' }).click();
	const cards = page.getByTestId('chord-card');
	await expect(cards).toHaveCount(12);
	await page.getByRole('button', { name: 'All types' }).click();
	await page.getByTestId('chord-search-toggle').click();
	await page.getByPlaceholder(/Search chords/).fill('Bø');
	await expect(cards.first()).toHaveAttribute('data-chord', 'Bm7b5');
	await expect(cards.first()).toHaveAttribute('data-voicing', 'x-2-3-2-3-x');
	await page.getByPlaceholder(/Search chords/).fill('maj7');
	await expect(cards).toHaveCount(12);
});
