// M7 the Mic check in the static demo: the timing test page is a real file under the base path,
// the worklet is a static file there too, single-note exercises offer Mic while strummed ones show
// it off with the reason, and a mic-checked pass is stored with its accuracy in the in-browser
// database (the demo's "server") like on the self-hosted one.
import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { fakeMicPage, listenReady, writeWavs } from '../e2e/m7-listen-helpers';

test('the timing test page and the Mic button work in the demo', async ({ page }) => {
	await page.goto('tools/calibrate');
	await expect(page.getByTestId('calibrate')).toHaveAttribute('data-status', 'idle', {
		timeout: 30_000
	});
	await expect(page.getByTestId('cal-stored')).toHaveText('Not measured yet');

	await page.goto('practice/exercise/first-notes-e-b');
	await expect(page.getByTestId('play-button')).toBeEnabled({ timeout: 30_000 });
	const toggle = page.getByTestId('listen-toggle');
	await expect(toggle).toBeVisible();
	await toggle.click();
	await expect(page.getByTestId('listen-setup')).toHaveAttribute('data-step', 'explain');
	await page.getByTestId('listen-cancel').click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');

	// Strummed chords: the Mic button is off, with its reason.
	await page.goto('practice/exercise/em-down-strums');
	await expect(page.getByTestId('play-button')).toBeEnabled({ timeout: 30_000 });
	await expect(page.getByTestId('listen-toggle')).toHaveCount(0);
	await page.getByTestId('listen-toggle-off').click({ force: true });
	await expect(page.getByTestId('mic-reason')).toContainText('strums coming');
});

test('the onset worklet is a static file under the base path', async ({ page }) => {
	const dir = 'build-demo/_app/immutable/workers';
	const file = fs.readdirSync(dir).find((f) => /^onset\.worklet-.*\.js$/.test(f));
	expect(file).toBeTruthy();
	await page.goto('./');
	const res = await page.request.get(`_app/immutable/workers/${file}`);
	expect(res.status()).toBe(200);
	expect(res.headers()['content-type']).toMatch(/javascript/);
	expect(await res.text()).toContain('registerProcessor');
});

test('a mic-checked pass is stored with its accuracy in the demo', async ({ playwright }) => {
	test.setTimeout(120_000);
	writeWavs();
	const { page, close } = await fakeMicPage(
		playwright.chromium,
		'exerciseGood',
		test.info().project.use
	);
	try {
		await listenReady(page);
		await page.getByTestId('play-button').click();
		await expect(page.getByTestId('ladder-clean')).toHaveAttribute('data-suggested', 'true', {
			timeout: 45_000
		});
		await page.getByTestId('ladder-clean').click();
		await page.getByTestId('play-button').click(); // stop
		// The strip comes back from the database after a reload.
		await page.reload();
		await expect(page.getByTestId('play-button')).toBeEnabled({ timeout: 30_000 });
		await expect(page.getByTestId('accuracy-strip')).toHaveAttribute('aria-label', /1[34]\/14/);
	} finally {
		await close();
	}
});
