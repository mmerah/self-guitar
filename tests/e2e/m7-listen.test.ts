// M7 the Mic check: the note checker and the mic timing test through Chromium's fake mic (see
// m7-listen-helpers.ts for the WAVs and how the timing is lined up).
import { expect, test, type Page } from '@playwright/test';
import {
	SHOTS,
	shot,
	COUNT_IN,
	PASS,
	START_SKEW_S,
	FAKE_INPUT_MS,
	CAL_MS,
	writeWavs,
	fakeMicPage,
	listenReady
} from './m7-listen-helpers';

test.beforeAll(writeWavs);

const exerciseApi = (page: Page) =>
	page.evaluate(async () => (await fetch('/api/exercises/first-notes-e-b')).json()) as Promise<{
		attempts: number;
		heard: { hits: number; total: number; clean: boolean }[];
	}>;

/** The checker's timing error, against the one the measured pass origin predicts. */
async function timingIsRight(page: Page) {
	const panel = page.getByTestId('ladder-panel');
	const dt = Number(await panel.getAttribute('data-listen-dt'));
	const origin = Number(await panel.getAttribute('data-listen-origin'));
	const predicted = (START_SKEW_S + COUNT_IN) * 1000 + FAKE_INPUT_MS - origin;
	console.log(`m7-listen: median timing error ${dt} ms (predicted ${Math.round(predicted)})`);
	expect(Math.abs(dt - predicted)).toBeLessThan(40);
	expect(Math.abs(dt)).toBeLessThan(120);
}

/** "More ways to measure", opened (it opens by itself when a non-default way was picked). */
const openMore = (page: Page) =>
	page.getByTestId('cal-more').evaluate((d) => ((d as HTMLDetailsElement).open = true));

test.describe('the Mic check', () => {
	test.skip(({ isMobile }) => !isMobile, 'phone project only (one fake-mic browser per test)');
	test.setTimeout(150_000);

	test('a pass played in time gets ✓ marks, is auto-rated Clean and stored with its accuracy', async ({
		playwright
	}, info) => {
		const { page, close } = await fakeMicPage(
			playwright.chromium,
			'exerciseGood',
			info.project.use
		);
		try {
			// The URL the worklet is loaded from (a worklet's fetch is invisible to request events).
			await page.addInitScript(() => {
				const add = AudioWorklet.prototype.addModule;
				AudioWorklet.prototype.addModule = function (url, opts) {
					const w = window as unknown as { __worklets?: string[] };
					(w.__worklets ??= []).push(String(url));
					return add.call(this, url, opts);
				};
			});
			await listenReady(page);
			const before = await exerciseApi(page);
			const streak = Number(await page.getByTestId('ladder').getAttribute('data-streak'));
			await page.getByTestId('play-button').click();
			await expect(page.getByTestId('mic-live')).toBeVisible({ timeout: 10_000 });
			// Mid-pass: notes already heard are marked ✓ (colour and glyph).
			await expect
				.poll(() => page.locator('.sg-listen-mark[data-status="good"][data-glyph="✓"]').count(), {
					timeout: 30_000
				})
				.toBeGreaterThanOrEqual(5);
			await shot(page, 'mid-pass-glyphs');
			const clean = page.getByTestId('ladder-clean');
			await expect(clean).toHaveAttribute('data-suggested', 'true', { timeout: 40_000 });
			await timingIsRight(page);
			await expect(page.getByTestId('ladder-feedback')).toHaveText(/1[3-4]\/14 notes/);
			await expect(page.getByTestId('rating-countdown')).toBeVisible();
			// Hands-free: the suggested rating saves itself, with the pass's accuracy.
			await expect(page.getByTestId('ladder')).toHaveAttribute('data-streak', String(streak + 1), {
				timeout: 8_000
			});
			await expect
				.poll(async () => (await exerciseApi(page)).attempts, { timeout: 5000 })
				.toBe(before.attempts + 1);
			const after = await exerciseApi(page);
			expect(after.heard.at(-1)).toMatchObject({ total: 14, clean: true });
			expect(after.heard.at(-1)!.hits).toBeGreaterThanOrEqual(13);
			// The next pass: its summary sits beside the accuracy strip (best so far).
			await expect(page.getByTestId('accuracy-strip')).toBeVisible();
			await expect(clean).toHaveAttribute('data-suggested', 'true', { timeout: 30_000 });
			await expect(page.getByTestId('ladder-feedback')).toHaveText(/best 1[3-4]\/14/);
			await shot(page, 'summary-strip');
			// The worklet came from a static file under the base path, not a Blob URL.
			const urls = await page.evaluate(
				() => (window as unknown as { __worklets?: string[] }).__worklets ?? []
			);
			console.log(`m7-listen: worklet ${urls.join(' ')}`);
			// (alphaTab loads its own synth worklet too.)
			expect(urls.some((u) => /\/_app\/immutable\/workers\/onset\.worklet-.*\.js$/.test(u))).toBe(
				true
			);
			expect(urls.filter((u) => u.startsWith('blob:'))).toEqual([]);
		} finally {
			await close();
		}
	});

	test('wrong notes are marked ✗ and the pass is auto-rated Miss', async ({ playwright }, info) => {
		const { page, close } = await fakeMicPage(
			playwright.chromium,
			'exerciseWrong',
			info.project.use
		);
		try {
			await listenReady(page);
			const streak = Number(await page.getByTestId('ladder').getAttribute('data-streak'));
			// The P key starts playback and opens the mic like the button does.
			await page.keyboard.press('KeyP');
			await expect(page.getByTestId('mic-live')).toBeVisible({ timeout: 10_000 });
			const miss = page.getByTestId('ladder-miss');
			await expect(miss).toHaveAttribute('data-suggested', 'true', { timeout: 45_000 });
			await expect(page.getByTestId('ladder-feedback')).toHaveText(/wrong/);
			expect(
				await page.locator('.sg-listen-mark[data-status="bad"][data-glyph="✗"]').count()
			).toBeGreaterThanOrEqual(3);
			// The learner overrides: a tap on Clean wins over the suggestion.
			await page.getByTestId('ladder-clean').click();
			await expect(page.getByTestId('ladder')).toHaveAttribute('data-streak', String(streak + 1));
			await expect(miss).toHaveAttribute('data-suggested', 'false');
			// Pause (P) lets the mic go; resume (P) opens it again; the resumed half-pass is not rated.
			await page.keyboard.press('KeyP');
			await expect(page.getByTestId('mic-live')).toHaveCount(0, { timeout: 5000 });
			await page.keyboard.press('KeyP');
			await expect(page.getByTestId('mic-live')).toBeVisible({ timeout: 10_000 });
		} finally {
			await close();
		}
	});

	test('a silent pass is not rated: "Didn\'t hear you"', async ({ playwright }, info) => {
		const { page, close } = await fakeMicPage(playwright.chromium, 'silence', info.project.use);
		try {
			await listenReady(page);
			const before = await exerciseApi(page);
			const streak = await page.getByTestId('ladder').getAttribute('data-streak');
			await page.getByTestId('play-button').click();
			await expect(page.getByTestId('mic-live')).toBeVisible({ timeout: 10_000 });
			const panel = page.getByTestId('ladder-panel');
			await expect(panel).toHaveAttribute('data-unheard', 'true', { timeout: 40_000 });
			await expect(page.getByTestId('ladder-feedback')).toHaveText(
				"Didn't hear you — check the mic"
			);
			await expect(page.locator('[data-suggested="true"]')).toHaveCount(0);
			// No row of "missed" marks for a pass the mic did not hear.
			expect(await page.locator('.sg-listen-mark[data-status]').count()).toBe(0);
			await shot(page, 'silence');
			// The loop idles on: the next silent pass is not rated either.
			await page.waitForTimeout(PASS * 1000 + 1500);
			await expect(page.locator('[data-suggested="true"]')).toHaveCount(0);
			await expect(page.getByTestId('ladder')).toHaveAttribute('data-streak', streak!);
			expect((await exerciseApi(page)).attempts).toBe(before.attempts);
		} finally {
			await close();
		}
	});

	test('a blocked mic is explained and nothing is rated', async ({ playwright }, info) => {
		const { page, close } = await fakeMicPage(
			playwright.chromium,
			'exerciseGood',
			info.project.use
		);
		try {
			await page.addInitScript(() => {
				navigator.mediaDevices.getUserMedia = () =>
					Promise.reject(new DOMException('blocked', 'NotAllowedError'));
			});
			await listenReady(page);
			const before = await exerciseApi(page);
			await page.getByTestId('play-button').click();
			await expect(page.getByTestId('mic-problem')).toHaveAttribute('data-problem', 'denied', {
				timeout: 10_000
			});
			// A whole pass plays: no marks, no suggestion, no stored attempt.
			await page.waitForTimeout((COUNT_IN + PASS) * 1000 + 1500);
			await expect(page.locator('[data-suggested="true"]')).toHaveCount(0);
			expect(await page.locator('.sg-listen-mark[data-status]').count()).toBe(0);
			await expect(page.getByTestId('ladder-panel')).not.toHaveAttribute(
				'data-listen-summary',
				/.+/
			);
			expect((await exerciseApi(page)).attempts).toBe(before.attempts);
		} finally {
			await close();
		}
	});

	test('first use: mic explainer, then the timing test', async ({ playwright }, info) => {
		const { page, close } = await fakeMicPage(playwright.chromium, 'clicksA', info.project.use);
		try {
			await page.goto('practice/exercise/first-notes-e-b');
			const toggle = page.getByTestId('listen-toggle');
			await expect(toggle).toHaveAttribute('aria-pressed', 'false');
			// The listening code is not on the page until Mic is turned on.
			expect(
				await page.evaluate(() => document.documentElement.dataset.listenCode)
			).toBeUndefined();
			await toggle.click();
			const setup = page.getByTestId('listen-setup');
			await expect(setup).toHaveAttribute('data-step', 'explain');
			expect(await page.evaluate(() => document.documentElement.dataset.listenCode)).toBe('loaded');
			await page.getByTestId('listen-allow').click();
			await expect(setup).toHaveAttribute('data-step', 'calibrate');
			await expect(setup.getByTestId('calibrate')).toBeVisible();
			await page.getByTestId('listen-skip-cal').click();
			await expect(setup).toBeHidden();
			await expect(page.getByTestId('ladder-panel')).toHaveAttribute('data-listen', 'notes');
			// Remembered: a reload keeps Mic on without asking again.
			await page.reload();
			await expect(toggle).toHaveAttribute('aria-pressed', 'true');
			await expect(page.getByTestId('ladder-panel')).toHaveAttribute('data-listen', 'notes');
			await expect(setup).toBeHidden();
		} finally {
			await close();
		}
	});

	test('the timing test measures a click track through the player', async ({
		playwright
	}, info) => {
		const errors: number[] = [];
		for (const wav of ['clicksA', 'clicksB'] as const) {
			const { page, close } = await fakeMicPage(playwright.chromium, wav, info.project.use);
			try {
				await page.goto('tools/calibrate');
				await expect(page.getByTestId('cal-stored')).toHaveText('Not measured yet');
				await openMore(page);
				await page.getByTestId('cal-mode-loopback').click();
				const cal = page.getByTestId('calibrate');
				await expect(cal).toHaveAttribute('data-status', 'idle', { timeout: 30_000 });
				await page.getByTestId('cal-pad').click();
				await expect(cal).toHaveAttribute('data-status', 'done', { timeout: 20_000 });
				const ms = Number(await cal.getAttribute('data-latency'));
				const first = Number(await cal.getAttribute('data-first-click'));
				// The WAV's third click (the first measured) is 1.5 s + its delay after the stream
				// opened; the player's first measured click came `first` ms after it.
				const want = 1500 + CAL_MS[wav === 'clicksA' ? 0 : 1] + FAKE_INPUT_MS - first;
				console.log(`m7-listen: timing test measured ${ms} ms, expected ${Math.round(want)}`);
				errors.push(ms - want);
				await expect(page.getByTestId('cal-verdict')).toHaveText(new RegExp(`${ms} ms measured`));
				if (wav === 'clicksA') await shot(page, 'calibrate-done');
				await expect(page.getByTestId('cal-stored')).toContainText(`${ms} ms`);
				// Stored for this device: the next visit knows it.
				await page.reload();
				await expect(page.getByTestId('cal-stored')).toContainText(`${ms} ms`);
				if (wav === 'clicksA') {
					await openMore(page);
					await page.getByTestId('cal-mode-pluck').click();
					await expect(cal).toHaveAttribute('data-status', 'idle', { timeout: 30_000 });
					await page
						.getByTestId('cal-more')
						.evaluate((d) => ((d as HTMLDetailsElement).open = false));
					await shot(page, 'calibrate');
				}
			} finally {
				await close();
			}
		}
		// The fake capture starts a little before getUserMedia resolves (when `first` is taken), by
		// up to a few tens of ms under load: measured runs low, never by more than this.
		errors.forEach((e) => expect(Math.abs(e)).toBeLessThanOrEqual(40));
	});
});

test.describe(() => {
	test.use({ colorScheme: 'dark' });
	test('strummed exercises: the Mic button is off with its reason; the chord check is experimental', async ({
		page
	}) => {
		await page.goto('practice/exercise/em-down-strums');
		await expect(page.getByTestId('play-button')).toBeEnabled({ timeout: 30_000 });
		await expect(page.getByTestId('listen-toggle')).toHaveCount(0);
		const off = page.getByTestId('listen-toggle-off');
		await expect(off).toHaveAttribute('aria-disabled', 'true');
		// aria-disabled (not disabled): a tap still explains why.
		await off.click({ force: true });
		const reason = page.getByTestId('mic-reason');
		await expect(reason).toContainText('Mic checks single notes; strums coming');
		await expect(reason.getByText('Experimental')).toBeVisible();
		if (SHOTS && page.viewportSize()?.width === 390) await shot(page, 'strummed-mic');
		await page.getByTestId('chord-check-toggle').click();
		await expect(page.getByTestId('listen-toggle')).toContainText('Chords');
		// Back off for the other tests.
		await page.evaluate(() => localStorage.removeItem('listen.chords'));
	});
});
