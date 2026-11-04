import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { LearnContent } from '../../src/lib/learn/types';

// M4.6: what to play on the exercise screen, Listen, tab zoom, and the space the main phone
// screens give their content.

/** The full curriculum (lesson bodies included), as the build wrote it. */
const getIndex = async (_page?: Page) =>
	(JSON.parse(fs.readFileSync('generated/content.json', 'utf8')) as { learn: LearnContent }).learn;

test('the exercise page says what to play: steps, chord diagrams, strum row', async ({ page }) => {
	const index = await getIndex(page);
	const ex = index.exercises.find((e) => (e.chords?.length ?? 0) >= 2 && e.strum)!;
	await page.goto(`/practice/exercise/${ex.id}`);
	const strip = page.getByTestId('what-to-play');
	await expect(strip).toBeVisible();
	await expect(strip.getByTestId('how-to')).toContainText(ex.howTo[0].slice(0, 25));
	await expect(strip.getByTestId('chord-mini')).toHaveCount(ex.chords!.length);
	await expect(strip.getByTestId('chord-mini').first().locator('svg')).toBeVisible();
	// Diagrams big enough to read the finger numbers.
	for (const d of await strip.getByTestId('chord-mini-diagram').all())
		expect((await d.boundingBox())!.width).toBeGreaterThanOrEqual(72);
	// Every step, in full, before the first clean pass.
	await expect(strip.getByTestId('how-to').locator('li')).toHaveCount(ex.howTo.length);
	await expect(page.getByTestId('strum-row').locator('li')).toHaveCount(
		ex.strum!.split(/\s+/).length
	);
	// The tab keeps most of the room.
	const vh = page.viewportSize()!.height;
	expect((await page.getByTestId('tab-viewport').boundingBox())!.height / vh).toBeGreaterThan(0.35);
	// Listen is the obvious first step for a new exercise.
	await expect(page.getByTestId('listen-button')).toBeVisible();
});

test('Listen plays a pass without recording an attempt', async ({ page }) => {
	const index = await getIndex(page);
	const ex = index.exercises.find((e) => e.strum)!;
	const before = await (await page.request.get(`/api/exercises/${ex.id}`)).json();
	await page.goto(`/practice/exercise/${ex.id}`);
	const player = page.getByTestId('tab-player');
	await expect(player).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
	const streak = await page.getByTestId('ladder').getAttribute('data-streak');
	await page.getByTestId('listen-button').click();
	await expect(player).toHaveAttribute('data-listening', 'true');
	await expect(page.getByTestId('listen-hint')).toBeVisible();
	await page.waitForTimeout(1500);
	// Stop listening: no rating prompt, no attempt.
	await page.getByTestId('listen-button').click();
	await expect(player).toHaveAttribute('data-listening', 'false');
	await expect(page.getByTestId('ladder')).toHaveAttribute('data-streak', streak!);
	await expect(page.getByTestId('ladder-feedback')).not.toContainText('how was it');
	const after = await (await page.request.get(`/api/exercises/${ex.id}`)).json();
	expect(after.attempts).toBe(before.attempts);
});

test('tab zoom −/+ changes the scale and persists across reload', async ({ page }) => {
	await page.goto('/play/ode-to-joy');
	const player = page.getByTestId('tab-player');
	await expect(player).toHaveAttribute('data-rendered', 'true', { timeout: 20_000 });
	await page.evaluate(() => localStorage.removeItem('player.scale.full'));
	await page.reload();
	await expect(player).toHaveAttribute('data-rendered', 'true', { timeout: 20_000 });
	const start = Number(await player.getAttribute('data-scale'));
	// Phones read the full player at 1.0, larger screens at 1.2.
	const phone = page.viewportSize()!.width < 600;
	expect(start).toBe(phone ? 1 : 1.2);
	await page.getByTestId('zoom-in').click();
	await expect(player).toHaveAttribute('data-scale', String(Math.round((start + 0.1) * 10) / 10));
	await page.getByTestId('zoom-in').click();
	const zoomed = String(Math.round((start + 0.2) * 10) / 10);
	await expect(player).toHaveAttribute('data-scale', zoomed);
	await page.reload();
	await expect(player).toHaveAttribute('data-scale', zoomed);
	await page.getByTestId('zoom-out').click();
	await page.getByTestId('zoom-out').click();
	await expect(player).toHaveAttribute('data-scale', String(start));
});

test('player controls stay compact on a phone', async ({ page }, info) => {
	test.skip(info.project.name !== 'phone', 'phone layout');
	await page.goto('/play/ode-to-joy');
	const controls = page.getByTestId('controls');
	await expect(controls).toBeVisible();
	expect((await controls.boundingBox())!.height).toBeLessThanOrEqual(120);
});

test('library rows are compact', async ({ page }, info) => {
	test.skip(info.project.name !== 'phone', 'phone layout');
	await page.goto('/library');
	const rows = page.getByTestId('song-card');
	await expect(rows.first()).toBeVisible();
	for (const row of (await rows.all()).slice(0, 4))
		expect((await row.boundingBox())!.height).toBeLessThanOrEqual(72);
	// No card runs past the screen's right edge.
	const width = page.viewportSize()!.width;
	for (const row of await rows.all()) {
		const b = (await row.boundingBox())!;
		expect(b.x + b.width).toBeLessThanOrEqual(width);
	}
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
		width
	);
});

test('the lesson footer is one slim row', async ({ page }) => {
	const index = await getIndex(page);
	await page.goto(`/learn/${index.lessons[1].id}`);
	const bar = page.getByTestId('lesson-bar');
	await expect(bar).toBeVisible();
	expect((await bar.boundingBox())!.height).toBeLessThanOrEqual(60);
	await expect(page.getByTestId('next-lesson')).toBeInViewport();
});

test('the tempo popover stays on screen', async ({ page }) => {
	await page.goto('/play/greensleeves');
	await expect(page.getByTestId('tab-player')).toHaveAttribute('data-rendered', 'true', {
		timeout: 20_000
	});
	await page.getByTestId('tempo-readout').click();
	const pop = (await page.getByTestId('tempo-popover').boundingBox())!;
	expect(pop.x).toBeGreaterThanOrEqual(0);
	expect(pop.x + pop.width).toBeLessThanOrEqual(page.viewportSize()!.width);
	// The bar status is in the controls, not over the music.
	const status = (await page.getByTestId('bar-status').boundingBox())!;
	const controls = (await page.getByTestId('controls').boundingBox())!;
	expect(status.y).toBeGreaterThanOrEqual(controls.y);
});

test('compact players zoom from their ⋯ menu', async ({ page }) => {
	const index = await getIndex(page);
	const lesson = index.lessons.find((l) => JSON.stringify(l.blocks).includes('"t":"atex"'))!;
	await page.goto(`/learn/${lesson.id}`);
	const player = page.locator('[data-testid=tab-player][data-compact=true]').first();
	await player.scrollIntoViewIfNeeded();
	await expect(player).toHaveAttribute('data-rendered', 'true', { timeout: 20_000 });
	const before = Number(await player.getAttribute('data-scale'));
	await player.getByTestId('player-more').click();
	await player.getByTestId('zoom-in').click();
	await expect(player).toHaveAttribute('data-scale', String(Math.round((before + 0.1) * 10) / 10));
});
