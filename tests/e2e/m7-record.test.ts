// M7 part B: record yourself. A fake microphone (a generated WAV) feeds MediaRecorder; takes go
// to IndexedDB and come back in the review sheet and /recordings.
import { chromium, expect, test } from '@playwright/test';
import {
	EXERCISE,
	hidePage,
	micBrowser,
	openRec,
	recordSolo,
	reviewAndKeep,
	rowAction,
	SONG
} from './m7-record-helpers';

test.describe.configure({ mode: 'serial' });

test('record 3 s on an exercise, review, keep; /recordings lists, compares, deletes', async ({
	browserName
}, info) => {
	test.skip(browserName !== 'chromium');
	const { page, close } = await micBrowser(chromium, info.project.use);
	try {
		await page.goto(`/practice/exercise/${EXERCISE}`);
		await expect(page.getByTestId('tab-player')).toHaveAttribute('data-rendered', 'true');
		await recordSolo(page, 3);
		await expect(page.getByTestId('review-meta')).toContainText(/0:0[2-5]/);
		await reviewAndKeep(page);

		// The ⋯ menu counts it.
		await page.getByTestId('player-more').click();
		await expect(page.getByTestId('my-recordings')).toHaveAttribute('data-count', '1');
		await page.getByTestId('my-recordings').click();
		await expect(page).toHaveURL(/\/recordings\?item=exercise/);
		const row = page.getByTestId('recording');
		await expect(row).toHaveCount(1);
		await expect(row).toContainText('🙂');
		await expect(row).toContainText('steady');

		// Survives a reload.
		await page.reload();
		await expect(page.getByTestId('recording')).toHaveCount(1);
		await page.getByTestId('recording-play').click();
		await expect(page.getByTestId('recording-play')).toHaveAttribute('data-playing', 'true');

		// Compare opens the exercise with that take's review, Compare on.
		await rowAction(page, 'recording-compare');
		await expect(page).toHaveURL(new RegExp(`/practice/exercise/${EXERCISE}\\?take=`));
		await expect(page.getByTestId('review-sheet')).toBeVisible();
		await expect(page.getByTestId('review-compare')).toHaveAttribute('aria-checked', 'true');
		await page.getByTestId('review-keep').click();

		await page.goto('/recordings');
		await rowAction(page, 'recording-delete');
		await page.getByTestId('recording-delete').click();
		await expect(page.getByTestId('recordings-empty')).toBeVisible();
		await page.goto('/progress');
		await expect(page.getByTestId('recordings-card')).toHaveAttribute('data-count', '0');
	} finally {
		await close();
	}
});

test('the stop key ends a take; page hide saves it', async ({ browserName }, info) => {
	test.skip(browserName !== 'chromium');
	const { page, close } = await micBrowser(chromium, info.project.use);
	try {
		await page.goto(`/practice/exercise/${EXERCISE}`);
		await expect(page.getByTestId('tab-player')).toHaveAttribute('data-rendered', 'true');
		const passes = await page
			.getByTestId('ladder')
			.getAttribute('data-streak')
			.catch(() => null);
		await recordSolo(page, 2, 'key');
		// PageDown stopped the take only (the ladder's "clean" key did not fire under it).
		if (passes !== null)
			await expect(page.getByTestId('ladder')).toHaveAttribute('data-streak', passes);
		await page.getByTestId('review-keep').click();

		// Page hide while recording: stopped and saved.
		await openRec(page);
		await page.getByTestId('rec-solo').click();
		await expect(page.getByTestId('rec-bar')).toHaveAttribute('data-phase', 'recording', {
			timeout: 15_000
		});
		await page.waitForTimeout(2500);
		await hidePage(page);
		await expect(page.getByTestId('rec-bar')).toBeHidden({ timeout: 10_000 });
		await page.goto('/recordings');
		await expect(page.getByTestId('recording')).toHaveCount(2);
		await expect(page.getByTestId('recordings-summary')).toContainText('2 takes');
		await expect(page.getByTestId('then-vs-now')).toBeVisible();
		await page.getByTestId('then-vs-now').click();
		await expect(page.getByTestId('recording-play').first()).toBeVisible();
		await page.getByTestId('recordings-delete-all').click();
		await page.getByTestId('recordings-delete-all').click();
		await expect(page.getByTestId('recordings-empty')).toBeVisible();
	} finally {
		await close();
	}
});

test('a song: record with the backing, then compare in sync', async ({ browserName }, info) => {
	test.skip(browserName !== 'chromium');
	const { page, close } = await micBrowser(chromium, info.project.use);
	try {
		await page.goto(`/play/${SONG}?view=tab`);
		await expect(page.getByTestId('tab-player')).toHaveAttribute('data-ready', 'true', {
			timeout: 30_000
		});
		await openRec(page);
		await expect(page.getByTestId('rec-headphones')).toBeVisible();
		await page.getByTestId('rec-along').click();
		await expect(page.getByTestId('rec-bar')).toHaveAttribute('data-phase', 'recording');
		await expect(page.getByTestId('play-button')).toHaveAttribute('data-playing', 'true');
		await page.waitForTimeout(2500);
		await page.getByTestId('rec-stop').click();
		await expect(page.getByTestId('play-button')).toHaveAttribute('data-playing', 'false');
		const sheet = page.getByTestId('review-sheet');
		await expect(sheet.getByTestId('take-waveform')).toHaveAttribute('data-ready', 'true');
		// The fresh take plays alone; Compare joins the tab in sync.
		await expect(sheet.getByTestId('review-play')).toHaveAttribute('data-what', 'take');
		await sheet.getByTestId('review-compare').click();
		await expect(sheet.getByTestId('review-compare')).toHaveAttribute('data-playing', 'true');
		await expect(sheet.getByTestId('review-play')).toHaveAttribute('data-what', 'both');
		await expect(page.getByTestId('play-button')).toHaveAttribute('data-playing', 'true');
		await sheet.getByTestId('review-play').click();
		await expect(page.getByTestId('play-button')).toHaveAttribute('data-playing', 'false');
		await sheet.getByTestId('review-delete').click();
		await sheet.getByTestId('review-delete').click();
		await expect(sheet).toBeHidden();
	} finally {
		await close();
	}
});
