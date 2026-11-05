// Shared by the self-hosted and demo M7 recording tests: a Chromium whose fake, auto-allowed
// microphone loops a generated WAV, and the steps of recording a take.
import fs from 'node:fs';
import path from 'node:path';
import { expect, type Browser, type BrowserType, type Page } from '@playwright/test';
import { SAMPLE_RATE } from '../fixtures/pluck';
import { writeWav } from './wav';

const localChromium = '/opt/pw-browsers/chromium';
const executablePath =
	!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(localChromium) ? localChromium : undefined;

/** Four seconds of decaying plucks (A3, C#4, E4…), half a second apart: a waveform with shape. */
export function recordWav(): string {
	const file = path.resolve('test-results/fixtures/m7-record.wav');
	if (fs.existsSync(file)) return file;
	const n = SAMPLE_RATE * 4;
	const out = new Float32Array(n);
	const notes = [220, 277.18, 329.63, 440];
	for (let k = 0; k < 8; k++) {
		const start = Math.round(k * 0.5 * SAMPLE_RATE);
		const f = notes[k % notes.length];
		for (let i = 0; start + i < n && i < SAMPLE_RATE * 0.5; i++) {
			const t = i / SAMPLE_RATE;
			out[start + i] += 0.6 * Math.exp(-t * 6) * Math.sin(2 * Math.PI * f * t);
		}
	}
	return writeWav(file, out);
}

type Use = {
	baseURL?: string;
	viewport?: { width: number; height: number } | null;
	isMobile?: boolean;
	hasTouch?: boolean;
	userAgent?: string;
	deviceScaleFactor?: number;
};

/** Twelve seconds of near silence (room noise far below the silence level): the solo auto-stop. */
export function silentWav(): string {
	const file = path.resolve('test-results/fixtures/m7-record-silent.wav');
	if (fs.existsSync(file)) return file;
	const n = SAMPLE_RATE * 12;
	const out = new Float32Array(n);
	for (let i = 0; i < n; i++) out[i] = 0.002 * Math.sin((2 * Math.PI * 110 * i) / SAMPLE_RATE);
	return writeWav(file, out);
}

/**
 * Counts what the page does with the mic and the recorder: getUserMedia calls, MediaRecorder
 * sessions, live audio tracks, decodeAudioData calls (window.__m7).
 */
export const COUNTERS = () => {
	const w = window as unknown as {
		__m7: { gum: number; recorders: number; decodes: number; streams: MediaStream[] };
	};
	w.__m7 = { gum: 0, recorders: 0, decodes: 0, streams: [] };
	const md = navigator.mediaDevices;
	if (md?.getUserMedia) {
		const gum = md.getUserMedia.bind(md);
		md.getUserMedia = async (c) => {
			w.__m7.gum++;
			const s = await gum(c);
			w.__m7.streams.push(s);
			return s;
		};
	}
	const MR = window.MediaRecorder;
	if (MR) {
		const Counted = function (
			this: MediaRecorder,
			...a: ConstructorParameters<typeof MediaRecorder>
		) {
			w.__m7.recorders++;
			return new MR(...a);
		} as unknown as typeof MediaRecorder;
		Counted.prototype = MR.prototype;
		Counted.isTypeSupported = MR.isTypeSupported.bind(MR);
		window.MediaRecorder = Counted;
	}
	const decode = BaseAudioContext.prototype.decodeAudioData;
	BaseAudioContext.prototype.decodeAudioData = function (
		this: BaseAudioContext,
		...a: Parameters<BaseAudioContext['decodeAudioData']>
	) {
		w.__m7.decodes++;
		return decode.apply(this, a);
	} as BaseAudioContext['decodeAudioData'];
};

/** window.__m7, with the live audio tracks counted now. */
export async function counters(page: Page) {
	return page.evaluate(() => {
		const m = (
			window as unknown as {
				__m7: { gum: number; recorders: number; decodes: number; streams: MediaStream[] };
			}
		).__m7;
		const live = new Set(
			m.streams.flatMap((s) => s.getAudioTracks()).filter((t) => t.readyState === 'live')
		).size;
		return { gum: m.gum, recorders: m.recorders, decodes: m.decodes, live };
	});
}

export async function micBrowser(
	browserType: BrowserType,
	use: Use,
	wav = recordWav()
): Promise<{ page: Page; browser: Browser; close: () => Promise<void> }> {
	const browser = await browserType.launch({
		executablePath,
		args: [
			'--use-fake-device-for-media-stream',
			'--use-fake-ui-for-media-stream',
			`--use-file-for-fake-audio-capture=${wav}`,
			'--autoplay-policy=no-user-gesture-required'
		]
	});
	const context = await browser.newContext({
		baseURL: use.baseURL,
		viewport: use.viewport,
		isMobile: use.isMobile,
		hasTouch: use.hasTouch,
		userAgent: use.userAgent,
		deviceScaleFactor: use.deviceScaleFactor,
		serviceWorkers: 'block',
		permissions: ['microphone']
	});
	await context.addInitScript(COUNTERS);
	const page = await context.newPage();
	return { page, browser, close: () => browser.close() };
}

/** Opens the Rec mode menu (the toolbar button, or ⋯ › Record yourself on a phone ladder). */
export async function openRec(page: Page) {
	const button = page.getByTestId('rec-button');
	if (await button.isVisible()) await button.click();
	else {
		await page.getByTestId('player-more').click();
		await page.getByTestId('rec-more-item').click();
	}
	await expect(page.getByTestId('rec-menu')).toBeVisible();
}

/** Records solo (click count-in) for about `seconds` once the count-in is over. */
export async function recordSolo(page: Page, seconds: number, stop: 'button' | 'key' = 'button') {
	await openRec(page);
	await page.getByTestId('rec-solo').click();
	const bar = page.getByTestId('rec-bar');
	await expect(bar).toHaveAttribute('data-phase', 'recording', { timeout: 15_000 });
	await page.waitForTimeout(seconds * 1000);
	await expect(page.getByTestId('rec-time')).not.toHaveText('0:00');
	if (stop === 'key') await page.keyboard.press('PageDown');
	else await page.getByTestId('rec-stop').click();
	await expect(bar).toBeHidden({ timeout: 10_000 });
	await expect(page.getByTestId('review-sheet')).toBeVisible();
}

/** The review: waveform from the stored peaks, the take plays by itself, then it is kept. */
export async function reviewAndKeep(page: Page) {
	const sheet = page.getByTestId('review-sheet');
	await expect(sheet.getByTestId('take-waveform')).toHaveAttribute('data-ready', 'true', {
		timeout: 10_000
	});
	await expect(sheet.getByTestId('take-waveform')).toHaveAttribute('data-source', 'stored');
	await expect(sheet.getByTestId('review-play')).toHaveAttribute('data-playing', 'true', {
		timeout: 10_000
	});
	await sheet.getByTestId('review-play').click();
	await expect(sheet.getByTestId('review-play')).toHaveAttribute('data-playing', 'false');
	await sheet.getByTestId('review-rate').nth(1).click();
	await sheet.getByTestId('review-more').click();
	await sheet.getByTestId('review-note').fill('steady');
	await sheet.getByTestId('review-keep').click();
	await expect(sheet).toBeHidden();
}

/** Pretends the tab went to the background (what a phone does on the home button). */
export async function hidePage(page: Page) {
	await page.evaluate(() => {
		Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
		document.dispatchEvent(new Event('visibilitychange'));
	});
}

/** Opens a row's ⋯ menu on /recordings and taps one of its items. */
export async function rowAction(page: Page, action: string, row = 0) {
	await page.getByTestId('recording-more').nth(row).click();
	await page.getByTestId('recording-menu').getByTestId(action).click();
}

export const EXERCISE = 'a-d-quarters';
export const SONG = 'aura-lee';
