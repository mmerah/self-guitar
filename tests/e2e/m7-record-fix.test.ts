// M7 record fixes: stored peaks (no decode to draw), one recorder session per take, hands-free
// stop (end of the backing, silence), the simplified review (and its landscape bar), the
// "not enough storage" message, and recording on the shared mic while Mic listening is on.
import { chromium, expect, test, type Page } from '@playwright/test';
import { latencyKey } from '../../src/lib/listen/latency';
import {
	counters,
	EXERCISE,
	micBrowser,
	openRec,
	recordSolo,
	rowAction,
	silentWav
} from './m7-record-helpers';

test.describe.configure({ mode: 'serial' });
test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || !isMobile, 'phone only');
test.setTimeout(120_000);

/** The takes in IndexedDB (metadata only). */
const storedTakes = (page: Page) =>
	page.evaluate(
		() =>
			new Promise<{ id: string; peaks?: number[] }[]>((resolve, reject) => {
				const r = indexedDB.open('self-guitar-recordings');
				r.onsuccess = () => {
					const q = r.result.transaction('takes').objectStore('takes').getAll();
					q.onsuccess = () => {
						resolve(q.result);
						r.result.close();
					};
					q.onerror = () => reject(q.error);
				};
				r.onerror = () => reject(r.error);
			})
	);

async function openExercise(page: Page, id = EXERCISE) {
	await page.goto(`/practice/exercise/${id}`);
	await expect(page.getByTestId('tab-player')).toHaveAttribute('data-rendered', 'true');
}

test('peaks are stored with the take; the review draws them without decoding; one session', async () => {
	const info = test.info();
	const { page, close } = await micBrowser(chromium, info.project.use);
	try {
		await openExercise(page);
		await recordSolo(page, 3);
		// One getUserMedia, one MediaRecorder session for the take; the mic is given back.
		let c = await counters(page);
		expect(c.recorders).toBe(1);
		expect(c.gum).toBe(1);
		expect(c.live).toBe(0);

		const sheet = page.getByTestId('review-sheet');
		await expect(sheet.getByTestId('take-waveform')).toHaveAttribute('data-source', 'stored');
		// It plays by itself (that decode is the playback's).
		await expect(sheet.getByTestId('review-play')).toHaveAttribute('data-playing', 'true');
		await sheet.getByTestId('review-keep').click();
		const [take] = await storedTakes(page);
		expect(take.peaks?.length).toBeGreaterThan(40); // ~20 per second
		expect(Math.max(...take.peaks!)).toBeGreaterThan(20);

		// Compare from My recordings: the review opens (not playing), waveform from the stored
		// peaks, and nothing is decoded.
		await page.getByTestId('player-more').click();
		await page.getByTestId('my-recordings').click();
		const row = page.getByTestId('recording');
		await expect(row).toHaveCount(1);
		// Two controls per row (play, ⋯); title, date, tempo and length in full.
		await expect(row.getByRole('button')).toHaveCount(2);
		await expect(row.getByTestId('recording-meta')).toContainText(/\d+ BPM · 0:0\d/);
		await rowAction(page, 'recording-rename');
		await page.getByTestId('recording-rename-input').fill('First try');
		await page.getByTestId('recording-rename-input').press('Enter');
		await expect(row).toContainText('First try');
		const before = (await counters(page)).decodes;
		await rowAction(page, 'recording-compare');
		await expect(sheet.getByTestId('take-waveform')).toHaveAttribute('data-source', 'stored');
		await expect(sheet.getByTestId('review-play')).toHaveAttribute('data-playing', 'false');
		await page.waitForTimeout(800);
		c = await counters(page);
		expect(c.decodes).toBe(before);

		// A take from before the fix (no peaks): computed once, then stored.
		await page.evaluate(
			(id) =>
				new Promise<void>((resolve) => {
					const r = indexedDB.open('self-guitar-recordings');
					r.onsuccess = () => {
						const s = r.result.transaction('takes', 'readwrite').objectStore('takes');
						const g = s.get(id);
						g.onsuccess = () => {
							const t = g.result;
							delete t.peaks;
							s.put(t).onsuccess = () => {
								r.result.close();
								resolve();
							};
						};
					};
				}),
			take.id
		);
		await page.reload();
		await expect(sheet.getByTestId('take-waveform')).toHaveAttribute('data-source', 'computed', {
			timeout: 10_000
		});
		await expect
			.poll(async () => (await storedTakes(page))[0].peaks?.length ?? 0)
			.toBeGreaterThan(40);
	} finally {
		await close();
	}
});

test('the simplified review: play, Compare, ratings, Keep, Delete; the rest under More', async () => {
	const info = test.info();
	const { page, close } = await micBrowser(chromium, info.project.use);
	try {
		await openExercise(page);
		await recordSolo(page, 2);
		const sheet = page.getByTestId('review-sheet');
		await expect(sheet).toHaveAttribute('data-layout', 'sheet');
		await expect(sheet.getByTestId('review-play')).toHaveAttribute('data-playing', 'true');
		await expect(sheet.getByTestId('review-compare')).toBeVisible();
		await expect(sheet.getByTestId('review-compare')).toHaveAttribute('aria-checked', 'false');
		await expect(sheet.getByTestId('review-rate')).toHaveCount(3);
		await expect(sheet.getByTestId('review-keep')).toBeVisible();
		await expect(sheet.getByTestId('review-delete')).toBeVisible();
		for (const id of ['review-note', 'review-name', 'review-balance-slider'])
			await expect(sheet.getByTestId(id)).toBeHidden();
		await sheet.getByTestId('review-more').click();
		for (const id of ['review-note', 'review-name', 'review-balance-slider'])
			await expect(sheet.getByTestId(id)).toBeVisible();

		// Compare: the take with the tab, in sync.
		await sheet.getByTestId('review-compare').click();
		await expect(sheet.getByTestId('review-play')).toHaveAttribute('data-what', 'both');
		await expect(page.getByTestId('play-button')).toHaveAttribute('data-playing', 'true');

		// Landscape: a compact bar; most of the tab stays in view.
		await sheet.getByTestId('review-more').click();
		await page.setViewportSize({ width: 844, height: 390 });
		await expect(sheet).toHaveAttribute('data-layout', 'bar');
		const box = (await sheet.boundingBox())!;
		expect(box.height).toBeLessThan(130);
		expect(box.y).toBeGreaterThan(390 - 131);
		await sheet.getByTestId('review-play').click();
		await expect(page.getByTestId('play-button')).toHaveAttribute('data-playing', 'false');
		await sheet.getByTestId('review-delete').click();
		await sheet.getByTestId('review-delete').click();
		await expect(sheet).toBeHidden();
	} finally {
		await close();
	}
});

test('the REC bar sits at the bottom, shows the stop key, and a backing take stops at its end', async () => {
	const info = test.info();
	const { page, close } = await micBrowser(chromium, info.project.use);
	try {
		await openExercise(page);
		await openRec(page);
		await page.getByTestId('rec-along').click();
		const bar = page.getByTestId('rec-bar');
		await expect(bar).toHaveAttribute('data-phase', 'recording');
		await expect(page.getByTestId('rec-hint')).toContainText('PageDown');
		await expect(page.getByTestId('rec-hint')).toContainText(/Stops at the end|Stops after/);
		// The page's back button and title stay uncovered.
		const b = (await bar.boundingBox())!;
		expect(b.y + b.height).toBeGreaterThan(830);
		const back = await page.locator('header a, header button').first().boundingBox();
		if (back) expect(back.y + back.height).toBeLessThan(b.y);
		// Nobody presses Stop: the take ends after the tab (4 bars at 46 BPM + count-in).
		await expect(bar).toBeHidden({ timeout: 70_000 });
		await expect(page.getByTestId('review-sheet')).toBeVisible();
		await expect(page.getByTestId('play-button')).toHaveAttribute('data-playing', 'false');
		await page.getByTestId('review-keep').click();
	} finally {
		await close();
	}
});

test('a solo take stops itself after the silence set in the menu', async () => {
	const info = test.info();
	const { page, close } = await micBrowser(chromium, info.project.use, silentWav());
	try {
		await openExercise(page);
		await openRec(page);
		await page.getByTestId('rec-silence').selectOption('5');
		await page.getByTestId('rec-solo').click();
		const bar = page.getByTestId('rec-bar');
		await expect(bar).toHaveAttribute('data-phase', 'recording', { timeout: 15_000 });
		await expect(page.getByTestId('rec-hint')).toContainText('5 s of silence');
		await expect(page.getByTestId('rec-silence-left')).toBeVisible({ timeout: 8000 });
		await expect(bar).toBeHidden({ timeout: 10_000 });
		await expect(page.getByTestId('review-sheet')).toBeVisible();
		await expect(page.getByTestId('review-meta')).toContainText(/0:0[4-7]/);
		// Remembered for next time.
		expect(await page.evaluate(() => localStorage.getItem('sg:rec.silence'))).toBe('5');
	} finally {
		await close();
	}
});

test('storage already full: "Not enough storage to record — free some space"', async () => {
	const info = test.info();
	const { page, close } = await micBrowser(chromium, info.project.use);
	try {
		await page.addInitScript(() => {
			navigator.storage.estimate = async () => ({ usage: 1e9 - 1024, quota: 1e9 });
		});
		await openExercise(page);
		await openRec(page);
		await page.getByTestId('rec-solo').click();
		const problem = page.getByTestId('rec-problem');
		await expect(problem).toContainText('Not enough storage to record — free some space');
		await expect(problem).not.toContainText('saved up to this point');
		expect((await counters(page)).recorders).toBe(0);
		await expect(page.getByTestId('rec-bar')).toBeHidden();
	} finally {
		await close();
	}
});

test('recording while Mic listening is on shares its one mic stream', async () => {
	const info = test.info();
	const { page, close } = await micBrowser(chromium, info.project.use);
	try {
		await page.goto('/');
		const ua = await page.evaluate(() => navigator.userAgent);
		await page.evaluate(
			([key]) => {
				localStorage.setItem('listen.on', '1');
				localStorage.setItem('listen.explained', '1');
				localStorage.setItem(
					key,
					JSON.stringify({ ms: 90, spread: 3, mode: 'loopback', at: new Date().toISOString() })
				);
			},
			[latencyKey(ua)]
		);
		await page.goto('/practice/exercise/first-notes-e-b');
		await expect(page.getByTestId('listen-toggle')).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByTestId('play-button')).toBeEnabled({ timeout: 30_000 });
		await page.getByTestId('play-button').click();
		await expect.poll(async () => (await counters(page)).live, { timeout: 10_000 }).toBe(1);

		await openRec(page);
		await page.getByTestId('rec-solo').click();
		await expect(page.getByTestId('rec-bar')).toHaveAttribute('data-phase', /countin|recording/, {
			timeout: 15_000
		});
		const c = await counters(page);
		expect(c.gum).toBe(1);
		expect(c.live).toBe(1);
		expect(c.recorders).toBeLessThanOrEqual(1);
		await page.getByTestId('rec-stop').click();
	} finally {
		await close();
	}
});
