// M7 part B on the static demo: takes live in IndexedDB the same way (nothing is uploaded).
import { chromium, expect, test } from '@playwright/test';
import {
	EXERCISE,
	hidePage,
	micBrowser,
	openRec,
	recordSolo,
	reviewAndKeep,
	rowAction
} from '../e2e/m7-record-helpers';

test('demo: record on an exercise, keep, list, reload, compare, page hide, delete', async () => {
	const info = test.info();
	const { page, close } = await micBrowser(chromium, info.project.use);
	try {
		await page.goto(`practice/exercise/${EXERCISE}`);
		await expect(page.getByTestId('tab-player')).toHaveAttribute('data-rendered', 'true', {
			timeout: 30_000
		});
		await recordSolo(page, 3);
		await reviewAndKeep(page);

		await page.goto('recordings');
		await expect(page.getByTestId('recording')).toHaveCount(1);
		await page.reload();
		await expect(page.getByTestId('recording')).toHaveCount(1);
		await rowAction(page, 'recording-compare');
		await expect(page).toHaveURL(new RegExp(`/self-guitar/practice/exercise/${EXERCISE}\\?take=`));
		await expect(page.getByTestId('review-sheet')).toBeVisible();
		await page.getByTestId('review-keep').click();

		// Page hide while recording, with the pedal key never pressed: saved anyway.
		await openRec(page);
		await page.getByTestId('rec-solo').click();
		await expect(page.getByTestId('rec-bar')).toHaveAttribute('data-phase', 'recording', {
			timeout: 15_000
		});
		await page.waitForTimeout(2500);
		await hidePage(page);
		await expect(page.getByTestId('rec-bar')).toBeHidden({ timeout: 10_000 });

		await page.goto('progress');
		await expect(page.getByTestId('recordings-card')).toHaveAttribute('data-count', '2');
		await page.getByTestId('recordings-card').click();
		await expect(page.getByTestId('recording')).toHaveCount(2);
		await page.getByTestId('recordings-delete-all').click();
		await page.getByTestId('recordings-delete-all').click();
		await expect(page.getByTestId('recordings-empty')).toBeVisible();
	} finally {
		await close();
	}
});
