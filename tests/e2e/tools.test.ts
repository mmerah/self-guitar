import fs from 'node:fs';
import { expect, test, type BrowserType, type TestInfo } from '@playwright/test';
import { micWavPath, type MicWav } from './wav';
const localChromium = '/opt/pw-browsers/chromium';
const executablePath =
	!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(localChromium) ? localChromium : undefined;

/**
 * A page in a separate Chromium whose fake, auto-allowed microphone loops a generated WAV.
 * The browser is launched here because the flags are per browser, not per context.
 */
async function fakeMicPage(browserType: BrowserType, wav: MicWav, use: TestInfo['project']['use']) {
	const browser = await browserType.launch({
		executablePath,
		args: [
			'--use-fake-device-for-media-stream',
			'--use-fake-ui-for-media-stream',
			`--use-file-for-fake-audio-capture=${micWavPath(wav)}`
		]
	});
	const context = await browser.newContext({
		baseURL: use.baseURL,
		viewport: use.viewport,
		isMobile: use.isMobile,
		hasTouch: use.hasTouch,
		userAgent: use.userAgent,
		deviceScaleFactor: use.deviceScaleFactor,
		serviceWorkers: 'block'
	});
	return { page: await context.newPage(), close: () => browser.close() };
}

test('home and nav lead to the tools hub', async ({ page }) => {
	await page.goto('/');
	await page.getByTestId('tools-entry').click();
	await expect(page).toHaveURL(/\/tools$/);
	await expect(page.getByTestId('tool-card')).toHaveCount(6);
	await expect(page.getByRole('navigation').getByRole('link', { name: 'Tools' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await page.getByTestId('tool-card').filter({ hasText: 'Metronome' }).click();
	await expect(page).toHaveURL(/\/tools\/metronome$/);
});

for (const [route, heading] of [
	['tuner', 'Tuner'],
	['metronome', 'Metronome'],
	['chords', 'Chords'],
	['changes', '1-minute changes'],
	['fretboard', 'Fretboard'],
	['ear', 'Ear trainer']
]) {
	test(`${route} page renders without horizontal scroll`, async ({ page }) => {
		await page.goto(`/tools/${route}`);
		await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
		expect(overflow).toBeLessThanOrEqual(0);
	});
}

test('tuner reads an 82.41 Hz input as E2, in tune', async ({ playwright }, testInfo) => {
	const { page, close } = await fakeMicPage(playwright.chromium, 'sineE2', testInfo.project.use);
	try {
		await page.goto('/tools/tuner');
		await expect(page.getByTestId('gauge-needle')).toHaveCount(0); // idle: no needle
		await page.getByTestId('tuner-toggle').click();
		await expect(page.getByTestId('tuner-note')).toHaveAttribute('data-note', 'E2', {
			timeout: 10_000
		});
		await expect(page.getByTestId('tuner-heard')).toContainText('Hearing E2');
		await expect(page.getByTestId('tuner-direction')).toContainText('In tune');
		await expect(page.getByTestId('tuner-cents')).toHaveAttribute('data-tone', 'ok');
		await page.getByTestId('tuner-toggle').click();
		await expect(page.getByTestId('tuner-readout')).toHaveAttribute('data-status', 'idle');
	} finally {
		await close();
	}
});

test('tuner reads 110 Hz as A2; locked to low E it says tune down', async ({
	playwright
}, testInfo) => {
	const { page, close } = await fakeMicPage(playwright.chromium, 'sineA2', testInfo.project.use);
	try {
		await page.goto('/tools/tuner');
		await page.getByTestId('tuner-toggle').click();
		await expect(page.getByTestId('tuner-note')).toHaveAttribute('data-note', 'A2', {
			timeout: 10_000
		});
		await page.getByRole('button', { name: 'String 6, E2' }).click();
		await expect(page.getByTestId('tuner-note')).toHaveAttribute('data-note', 'E2');
		await expect(page.getByTestId('tuner-direction')).toContainText('Loosen');
		await expect(page.getByTestId('tuner-cents')).toHaveAttribute('data-tone', 'danger');
	} finally {
		await close();
	}
});

test('tuner holds E2 through the decay of a low string whose fundamental dies first', async ({
	playwright
}, testInfo) => {
	const { page, close } = await fakeMicPage(playwright.chromium, 'pluckE2', testInfo.project.use);
	try {
		await page.goto('/tools/tuner');
		await page.getByTestId('tuner-toggle').click();
		const note = page.getByTestId('tuner-note');
		await expect(note).toHaveAttribute('data-note', 'E2', { timeout: 10_000 });
		// The WAV (3 s) loops: sample for two full plucks. The detector alone reads E3 after ~0.5 s.
		const seen = new Set<string>();
		for (let i = 0; i < 60; i++) {
			seen.add((await note.getAttribute('data-note')) ?? '');
			await page.waitForTimeout(100);
		}
		seen.delete('');
		expect([...seen]).toEqual(['E2']);
	} finally {
		await close();
	}
});

test('tuner releases the mic when stopped while the permission prompt is open', async ({
	page
}) => {
	await page.addInitScript(() => {
		const w = window as unknown as { micStops: number; grant: () => void };
		w.micStops = 0;
		navigator.mediaDevices.getUserMedia = () =>
			new Promise((resolve) => {
				w.grant = () => {
					const track = { stop: () => w.micStops++, addEventListener() {} };
					resolve({ getTracks: () => [track], getAudioTracks: () => [track] } as never);
				};
			});
	});
	await page.goto('/tools/tuner');
	const toggle = page.getByTestId('tuner-toggle');
	await toggle.click();
	await expect(page.getByTestId('tuner-readout')).toHaveAttribute('data-status', 'starting');
	await toggle.click(); // Stop while the prompt is still open
	await page.evaluate(() => (window as unknown as { grant: () => void }).grant());
	await expect
		.poll(() => page.evaluate(() => (window as unknown as { micStops: number }).micStops))
		.toBe(1);
	await expect(page.getByTestId('tuner-readout')).toHaveAttribute('data-status', 'idle');
});

test('tuner explains a blocked microphone', async ({ page }) => {
	await page.addInitScript(() => {
		navigator.mediaDevices.getUserMedia = () =>
			Promise.reject(new DOMException('denied', 'NotAllowedError'));
	});
	await page.goto('/tools/tuner');
	await page.getByTestId('tuner-toggle').click();
	await expect(page.getByTestId('mic-problem')).toHaveAttribute('data-problem', 'denied');
	await expect(page.getByTestId('tuner-toggle')).toHaveText(/Try again/);
	await expect(page.getByTestId('tuner-toggle')).toBeInViewport();
});

test('metronome starts, ticks, stops and remembers its tempo', async ({ page }) => {
	await page.goto('/tools/metronome');
	await page.evaluate(() => localStorage.removeItem('metronome:v1'));
	await page.reload();
	const toggle = page.getByTestId('metronome-toggle');
	await expect(page.getByTestId('bpm-value')).toHaveText('80');
	await page.getByRole('button', { name: 'Faster' }).click();
	await expect(page.getByTestId('bpm-value')).toHaveText('81');
	await page.getByRole('button', { name: '3/4' }).click();
	await expect(page.getByTestId('beat-dots').locator('span')).toHaveCount(3);

	await toggle.click();
	await expect(toggle).toHaveAttribute('data-running', 'true');
	await expect(page.locator('[data-testid="beat-dots"] [data-active="true"]')).toHaveCount(1);
	await toggle.click();
	await expect(toggle).toHaveAttribute('data-running', 'false');
	await expect(page.locator('[data-testid="beat-dots"] [data-active="true"]')).toHaveCount(0);

	await page.reload();
	await expect(page.getByTestId('bpm-value')).toHaveText('81');
	await expect(page.getByRole('button', { name: '3/4' })).toHaveAttribute('aria-pressed', 'true');
	await page.evaluate(() => localStorage.removeItem('metronome:v1'));
});

test('chord library filters, renders diagrams and switches voicings', async ({ page }) => {
	await page.goto('/tools/chords');
	const cards = page.getByTestId('chord-card');
	await page
		.getByRole('group', { name: 'Root' })
		.getByRole('button', { name: 'G', exact: true })
		.click();
	await page
		.getByRole('group', { name: 'Quality' })
		.getByRole('button', { name: '7', exact: true })
		.click();
	await expect(cards).toHaveCount(1);
	const g7 = cards.first();
	await expect(g7).toHaveAttribute('data-chord', 'G7');
	await expect(g7.locator('svg .finger-3')).not.toHaveCount(0);
	await expect(g7).toContainText('Open');
	await expect(g7.getByTestId('next-voicing')).toHaveText(/Voicing 1\/3/);
	await g7.getByTestId('next-voicing').click();
	await expect(g7).toContainText('E-shape barre');
	await g7.getByTestId('play-chord').click();

	await page.getByRole('button', { name: 'All roots' }).click();
	await page.getByRole('button', { name: 'All types' }).click();
	await page.getByTestId('chord-search-toggle').click();
	await page.getByPlaceholder(/Search chords/).fill('sus');
	await expect(cards).toHaveCount(4);

	// Open chords by default; barre chords and enharmonic search on request.
	await page.getByPlaceholder(/Search chords/).fill('a#');
	// Only the Bbmaj7 shell (x-1-0-2-x-x, on the open D string) is an open B♭ chord.
	await expect(cards).toHaveCount(1);
	await expect(cards.first()).toHaveAttribute('data-chord', 'Bbmaj7');
	await page.getByRole('button', { name: 'Barre / all' }).click();
	await expect(cards.first()).toHaveAttribute('data-chord', 'Bb');
});

test('1-minute changes: count in your head, enter the total', async ({ page }) => {
	await page.clock.install();
	await page.goto('/tools/changes');
	await page.getByLabel('First chord').selectOption('E');
	await page.getByLabel('Second chord').selectOption('Am');
	await expect(page.getByTestId('pair-best')).toContainText('Goal 30 = solid');
	// The voicing picked on the card is the one shown in the session.
	const g = page.getByTestId('pair-diagrams').getByTestId('chord-card').first();
	await page.getByLabel('First chord').selectOption('G');
	await g.getByTestId('next-voicing').click();
	const voicing = await g.getAttribute('data-voicing');
	await page.getByTestId('changes-start').click();
	await page.clock.runFor(3_200);
	const session = page.getByTestId('changes-session');
	await expect(session).toHaveAttribute('data-phase', 'running');
	await expect(page.getByTestId('changes-tap')).toBeDisabled();
	await expect(page.getByTestId('session-a')).toHaveAttribute('data-voicing', voicing!);
	await expect(page.getByTestId('changes-remaining')).toHaveText('60');
	await page.keyboard.press('Space'); // no counting in this mode
	await page.clock.runFor(61_000);
	await expect(session).toHaveAttribute('data-phase', 'done');
	await page.getByTestId('changes-count-input').fill('27');
	await expect(page.getByTestId('changes-count-input')).toHaveValue('27');
	await page.getByTestId('changes-save').click();
	await expect(page.getByTestId('saved-result')).toContainText('Saved: 27 changes');
	expect(voicing).toBe('3-2-0-0-3-3');
});

test('1-minute changes counts taps and pedal presses and saves the result', async ({ page }) => {
	await page.clock.install();
	await page.goto('/tools/changes');
	await page.getByLabel('First chord').selectOption('G');
	await page.getByLabel('Second chord').selectOption('C');
	await expect(page.getByTestId('pair-diagrams').getByTestId('chord-card')).toHaveCount(2);
	await page.getByTestId('tap-mode').check();

	await page.getByTestId('changes-start').click();
	const session = page.getByTestId('changes-session');
	await expect(session).toHaveAttribute('data-phase', 'countin');
	await expect(page.getByTestId('countin')).toHaveText('3');
	await page.clock.runFor(3_200);
	await expect(session).toHaveAttribute('data-phase', 'running');
	const tap = page.getByTestId('changes-tap');
	for (let i = 0; i < 3; i++) await tap.click();
	await page.keyboard.press('PageDown'); // Bluetooth page-turner pedal
	await page.keyboard.press('ArrowRight');
	await expect(page.getByTestId('changes-count')).toHaveText('5');

	await page.clock.runFor(61_000);
	await expect(session).toHaveAttribute('data-phase', 'done');
	await expect(page.getByTestId('changes-count-input')).toHaveValue('5');
	await page.getByRole('button', { name: 'One more' }).click();

	const saved = page.waitForResponse(
		(r) => r.url().endsWith('/api/chord-changes') && r.request().method() === 'POST'
	);
	await page.getByTestId('changes-save').click();
	const res = await saved;
	expect(res.status()).toBe(201);
	expect(res.request().postDataJSON()).toMatchObject({ chordA: 'G', chordB: 'C', count: 6 });
	expect(await res.json()).toMatchObject({ chordA: 'C', chordB: 'G' });
	await expect(page.getByTestId('saved-result')).toContainText('Saved: 6 changes');
	await expect(page.getByTestId('pair-best')).toContainText('C – G');
	await expect(page.getByTestId('pair-list')).toContainText('C – G');
});
