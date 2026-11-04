// A new deploy while the app is open: the installed worker finds the new one (on visibility), and
// it waits for the learner (the update bar) except on an idle screen. The new deploy is simulated
// by changing the served sw.js (what any rebuild does: new precache revisions).
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const SW = 'build-demo/sw.js';
const VERSION = /^Self-Guitar v\d+\.\d+\.\d+ · [0-9a-f]{7} · \d{4}-\d{2}-\d{2}$/;

test.use({ serviceWorkers: 'allow' });

let original = '';
test.beforeAll(() => {
	original = fs.readFileSync(SW, 'utf8');
});
test.afterEach(() => {
	fs.writeFileSync(SW, original);
});

/** Loads `path` until the installed worker controls it. */
async function installed(page: Page, path: string) {
	await page.goto(path);
	await page.evaluate(() => navigator.serviceWorker.ready);
	await expect
		.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 })
		.toBe(true);
}

/** Deploys "build B" and brings the app back to the foreground. */
async function deployAndResume(page: Page) {
	fs.writeFileSync(SW, `${original}\n// build B ${Date.now()}\n`);
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}

test('a waiting version shows the update bar on Tools; Reload applies it', async ({ page }) => {
	await installed(page, 'tools');
	await expect(page.getByTestId('app-version')).toHaveText(VERSION);
	await expect(page.getByTestId('update-bar')).toHaveCount(0);
	await deployAndResume(page);
	const bar = page.getByTestId('update-bar');
	await expect(bar).toBeVisible({ timeout: 30_000 });
	await expect(bar).toContainText('New version available');
	await expect(page.getByTestId('app-version-update')).toHaveText('(update available)');
	// Nothing reloads on its own here.
	await page.waitForTimeout(1000);
	await expect(bar).toBeVisible();
	await Promise.all([page.waitForEvent('load'), page.getByTestId('update-reload').click()]);
	await expect(page.getByTestId('app-version')).toHaveText(VERSION);
	await expect(page.getByTestId('update-bar')).toHaveCount(0);
	expect(
		await page.evaluate(async () => !(await navigator.serviceWorker.getRegistration())?.waiting)
	).toBe(true);
});

test('an idle Today screen applies the new version on its own', async ({ page }) => {
	await installed(page, './');
	await expect(page.getByTestId('plan')).toBeVisible();
	await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1));
	await deployAndResume(page);
	// The page reloaded into the new version (the marker is gone).
	await expect
		.poll(
			() =>
				page.evaluate(() => (window as unknown as { marker?: number }).marker ?? 0).catch(() => -1), // mid-navigation
			{ timeout: 30_000 }
		)
		.toBe(0);
	await expect(page.getByTestId('plan')).toBeVisible();
	expect(
		await page.evaluate(async () => !(await navigator.serviceWorker.getRegistration())?.waiting)
	).toBe(true);
});

test("the demo's options show the version", async ({ page }) => {
	await page.goto('./');
	await page.getByTestId('demo-options').click();
	await expect(page.getByTestId('demo-banner').getByTestId('app-version')).toHaveText(VERSION);
});
