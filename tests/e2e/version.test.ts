// The build's identity (package.json version · commit sha · build date) is visible.
import { expect, test } from '@playwright/test';

const pkg = (await import('../../package.json', { with: { type: 'json' } })).default;
const VERSION = new RegExp(
	`^Self-Guitar v${pkg.version.replace(/\./g, '\\.')} · [0-9a-f]{7} · \\d{4}-\\d{2}-\\d{2}$`
);

test('the version shows on the About page and the Tools hub', async ({ page }) => {
	await page.goto('/about/attributions');
	await expect(page.getByTestId('about-footer').getByTestId('app-version')).toHaveText(VERSION);
	await page.goto('/tools');
	const line = page.getByTestId('app-version');
	await expect(line).toHaveText(VERSION);
	// No update waiting (service workers are blocked here).
	await expect(page.getByTestId('app-version-update')).toHaveCount(0);
	await expect(page.getByTestId('update-bar')).toHaveCount(0);
});

test('tapping the version copies it', async ({ page, context, browserName }) => {
	test.skip(browserName !== 'chromium');
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.goto('/tools');
	const text = await page.getByTestId('app-version').textContent();
	await page.getByTestId('app-version').click();
	await expect(page.getByText('Copied')).toBeVisible();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
});
