// M7.1 flows shared by the self-hosted and the demo runs: lessons are previewed until started
// (Start lesson, an attempt), a reset takes one back; the song page's Lyrics | Tab | Both switch.
// `at` turns an app path ('learn/x') into the run's URL ('/learn/x' or 'learn/x' under the demo's
// base).
import fs from 'node:fs';
import { expect, type Page } from '@playwright/test';
import type { LearnContent, LessonMeta } from '../../src/lib/learn/types';

export type At = (path: string) => string;

export const curriculum = () =>
	(JSON.parse(fs.readFileSync('generated/content.json', 'utf8')) as { learn: LearnContent }).learn;

const state = (page: Page) => page.getByTestId('lesson-state');

async function planTitles(page: Page, at: At) {
	await page.goto(at(''));
	await expect(page.getByTestId('plan-block').first()).toBeVisible({ timeout: 20_000 });
	const titles = await page.getByTestId('plan-block-title').allTextContents();
	return { has: (title: string) => titles.some((t) => t.includes(title)) };
}

/** The lesson's row on Learn, its level opened (a tab on wide screens, a fold on phones). */
async function rowState(page: Page, at: At, id: string) {
	await page.goto(at('learn'));
	const level = curriculum().lessons.find((l) => l.id === id)!.level;
	await expect(page.getByTestId('lesson-row').first()).toBeVisible();
	if (await page.getByTestId('learn-wide').isVisible())
		await page.getByTestId('level-tab').nth(level).click();
	else {
		const fold = page.getByRole('region', { name: `Level ${level}`, exact: true });
		if ((await fold.getAttribute('data-open')) === 'false')
			await fold.getByTestId('level-toggle').click();
	}
	const row = page.locator(`[data-testid=lesson-row][data-lesson="${id}"]`);
	await expect(row).toHaveCount(1);
	return row;
}

/** A lesson far ahead (nothing earlier in this run touched it), with an exercise to practise. */
export function futureLessons(offset = 0): { browse: LessonMeta; practise: LessonMeta } {
	const ls = curriculum().lessons;
	const withEx = ls.filter((l) => l.level >= 5 && (l.exercises ?? []).length);
	return { browse: ls[ls.length - 12 - offset], practise: withEx[withEx.length - 1 - offset] };
}

/** Preview → Today and Learn ignore it → Start → in progress → Reset (dialog) → not started. */
export async function previewStartReset(page: Page, at: At, lesson: LessonMeta) {
	await page.goto(at(`learn/${lesson.id}`));
	await expect(state(page)).toHaveAttribute('data-state', 'new');
	await expect(page.getByTestId('lesson-preview')).toBeVisible();
	await expect(page.getByTestId('lesson-bar-state')).toContainText('Preview');
	// Nothing to reset in a preview.
	await expect(page.getByTestId('lesson-more')).toHaveCount(0);

	expect((await planTitles(page, at)).has(lesson.title)).toBe(false);
	const row = await rowState(page, at, lesson.id);
	await expect(row).toHaveAttribute('data-state', 'new');
	await expect(row.getByTitle('Not started')).toBeVisible();
	await expect(page.getByTestId('learn-continue')).not.toHaveAttribute('data-lesson', lesson.id);

	// Start lesson: in progress, the lesson to continue, in today's plan.
	await page.goto(at(`learn/${lesson.id}`));
	await page.getByTestId('lesson-start').click();
	await expect(state(page)).toHaveAttribute('data-state', 'started');
	await expect(page.getByTestId('lesson-preview')).toHaveCount(0);
	await page.reload();
	await expect(state(page)).toHaveAttribute('data-state', 'started');
	expect((await planTitles(page, at)).has(lesson.title)).toBe(true);
	await expect(await rowState(page, at, lesson.id)).toHaveAttribute('data-state', 'started');
	await expect(page.getByTestId('learn-continue')).toHaveAttribute('data-lesson', lesson.id);

	// Reset from the bar's ⋯: a small confirm dialog; Cancel changes nothing.
	await page.goto(at(`learn/${lesson.id}`));
	await page.getByTestId('lesson-more').click();
	await page.getByTestId('lesson-reset').click();
	const dialog = page.getByTestId('reset-dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByTestId('reset-cancel').click();
	await expect(dialog).toHaveCount(0);
	await expect(state(page)).toHaveAttribute('data-state', 'started');
	await page.getByTestId('lesson-more').click();
	await page.getByTestId('lesson-reset').click();
	await page.getByTestId('reset-confirm').click();
	await expect(state(page)).toHaveAttribute('data-state', 'new');
	await expect(page.getByTestId('lesson-preview')).toBeVisible();
	expect((await planTitles(page, at)).has(lesson.title)).toBe(false);
	await expect(await rowState(page, at, lesson.id)).toHaveAttribute('data-state', 'new');
}

/** An attempt on the lesson's exercise (practice page opened from it) starts the lesson. */
export async function attemptStarts(page: Page, at: At, lesson: LessonMeta) {
	const exId = lesson.exercises![0];
	await page.goto(at(`learn/${lesson.id}`));
	await expect(state(page)).toHaveAttribute('data-state', 'new');
	await page
		.locator(`[data-testid=exercise-card][data-exercise="${exId}"]`)
		.getByTestId('exercise-practice')
		.click();
	await expect(page).toHaveURL(new RegExp(`/practice/exercise/${exId}\\?from=${lesson.id}$`));
	await expect(page.getByTestId('ladder-clean')).toBeVisible({ timeout: 20_000 });
	await page.getByTestId('ladder-clean').click();
	// (Let the save land before leaving the page.)
	await page.waitForTimeout(1000);
	// Saved with its lesson: the lesson is in progress now.
	await expect
		.poll(
			async () => {
				await page.goto(at(`learn/${lesson.id}`));
				await expect(state(page)).toBeVisible();
				return state(page).getAttribute('data-state');
			},
			{ timeout: 15_000 }
		)
		.toBe('started');
	await expect(page.getByTestId('lesson-preview')).toHaveCount(0);
}

/** Two chord-sheet-only songs. */
export const SONGS = ['clementine', 'aura-lee'] as const;

const barOf = async (page: Page) => {
	const t = (await page.getByTestId('bar-status').textContent()) ?? '';
	return /Bar (\d+)/.exec(t) ? Number(/Bar (\d+)/.exec(t)![1]) : 0;
};

/**
 * Lyrics → Tab while playing: the lyric lines go, the tab fills the screen, playback carries on
 * from the same place; the choice survives a reload and opens the next song the same way.
 */
export async function songViewSwitch(page: Page, at: At) {
	const view = page.getByTestId('song-view');
	await page.goto(at(`play/${SONGS[0]}`));
	await expect(view).toHaveAttribute('data-view', 'lyrics');
	await expect(page.getByTestId('lyrics')).toBeVisible();
	await expect(page.getByTestId('sheet-line').first()).toBeVisible();
	await expect(page.getByTestId('tab-viewport')).toBeHidden();
	await expect(page.getByTestId('tab-player')).toHaveAttribute('data-ready', 'true', {
		timeout: 30_000
	});

	await page.getByTestId('play-button').click();
	await expect(page.getByTestId('play-button')).toHaveAttribute('data-playing', 'true');
	await expect.poll(() => barOf(page), { timeout: 20_000 }).toBeGreaterThanOrEqual(3);
	const before = await barOf(page);

	await page.getByTestId('song-view-tab').click();
	await expect(view).toHaveAttribute('data-view', 'tab');
	await expect(page.getByTestId('lyrics')).toBeHidden();
	await expect(page.getByTestId('sheet-line').first()).toBeHidden();
	// The chord strip and strum row stay; the tab takes the room the lyrics had.
	await expect(page.getByTestId('chord-bar')).toBeVisible();
	await expect(page.getByTestId('strum-row')).toBeVisible();
	await expect(page.getByTestId('tab-viewport')).toBeVisible();
	const tabBox = await page.getByTestId('tab-viewport').boundingBox();
	expect(tabBox!.height).toBeGreaterThan(300);
	// Still playing, from where it was (no restart).
	await expect(page.getByTestId('play-button')).toHaveAttribute('data-playing', 'true');
	expect(await barOf(page)).toBeGreaterThanOrEqual(before);
	// Rec works in every view (its button sits in the transport, or under ⋯ when narrow).
	await expect(
		page.getByTestId('rec-button').or(page.getByTestId('player-more')).first()
	).toBeVisible();

	await page.getByTestId('song-view-both').click();
	await expect(page.getByTestId('lyrics')).toBeVisible();
	await expect(page.getByTestId('tab-viewport')).toBeVisible();
	await expect(page.getByTestId('play-button')).toHaveAttribute('data-playing', 'true');
	expect(await barOf(page)).toBeGreaterThanOrEqual(before);
	await page.getByTestId('song-view-tab').click();
	await page.getByTestId('play-button').click();
	await expect(page.getByTestId('play-button')).toHaveAttribute('data-playing', 'false');

	// Remembered: after a reload, and on another song.
	await page.reload();
	await expect(view).toHaveAttribute('data-view', 'tab');
	await expect(page.getByTestId('lyrics')).toBeHidden();
	await page.goto(at(`play/${SONGS[1]}`));
	await expect(view).toHaveAttribute('data-view', 'tab');
	await expect(page.getByTestId('lyrics')).toBeHidden();
	await expect(page.getByTestId('tab-player')).toHaveAttribute('data-rendered', 'true', {
		timeout: 30_000
	});
	await page.getByTestId('song-view-lyrics').click();
	await expect(page.getByTestId('lyrics')).toBeVisible();
	await page.goto(at(`play/${SONGS[0]}`));
	await expect(view).toHaveAttribute('data-view', 'lyrics');
}
