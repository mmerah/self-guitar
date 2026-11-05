// M7 the Mic check (helpers shared with the demo run): the note checker and the mic timing test, heard through Chromium's fake mic.
// The fake mic plays a generated WAV from the moment a stream opens (the app opens a fresh one on
// each start of playback / timing test), so a WAV laid out on the expected timeline plus a known
// latency plays like a learner in time. Headless audio jitters, and alphaTab starts a little after
// the stream: the app reports where the pass (or the first click) landed relative to the stream
// (data-listen-origin, data-first-click) and the timing assertions are made relative to that.
import fs from 'node:fs';
import path from 'node:path';
import { expect, type BrowserType, type Page, type TestInfo } from '@playwright/test';
import { writeWav } from './wav';
import { pluckSamples, SAMPLE_RATE } from '../fixtures/pluck';
import { latencyKey } from '../../src/lib/listen/latency';

export const localChromium = '/opt/pw-browsers/chromium';
export const executablePath =
	!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(localChromium) ? localChromium : undefined;
export const SHOTS = process.env.M7_SHOTS;
/** Screenshots in portrait (the project's 390×844) and landscape (844×390), dark. */
export async function shot(page: Page, name: string) {
	if (!SHOTS) return;
	await page.screenshot({ path: `${SHOTS}/${name}-390x844.png` });
	await page.setViewportSize({ width: 844, height: 390 });
	await page.waitForTimeout(700);
	await page.screenshot({ path: `${SHOTS}/${name}-844x390.png` });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.waitForTimeout(400);
}
export const FIXTURES = path.resolve('test-results/fixtures');

// first-notes-e-b at its start tempo (52 BPM): 14 notes over 4 bars, one bar of count-in.
export const BPM = 52;
export const BEAT = 60 / BPM;
export const COUNT_IN = 4 * BEAT;
export const PASS = 16 * BEAT;
/** [beat, MIDI] of the exercise (B C D C | B C B– | E F G F | E D E–). */
export const NOTES: [number, number][] = [
	[0, 59],
	[1, 60],
	[2, 62],
	[3, 60],
	[4, 59],
	[5, 60],
	[6, 59],
	[8, 64],
	[9, 65],
	[10, 67],
	[11, 65],
	[12, 64],
	[13, 62],
	[14, 64]
];
/** The "learner" plays this late after what they hear (the stored calibration says so too). */
export const LATENCY_MS = 90;
/**
 * Where the WAV puts the first beat after the stream opens: the count-in plus alphaTab's own
 * start-up, nominally (≈ 95 ms in headless Chromium, ±35 ms run to run). Placement only: the
 * timing assertion uses the pass origin the app measured (data-listen-origin).
 */
export const START_SKEW_S = Number(process.env.M7_SKEW ?? 0.095);
/** Chromium's fake capture's own input latency (its 10 ms buffers). */
export const FAKE_INPUT_MS = 10;
export const MIDI_FREQ = (m: number) => 440 * 2 ** ((m - 69) / 12);

export function noise(seconds: number, level = 0.001) {
	const out = new Float32Array(Math.round(seconds * SAMPLE_RATE));
	let seed = 7;
	for (let i = 0; i < out.length; i++) {
		seed = (seed * 16807) % 2147483647;
		out[i] = (seed / 2147483647 - 0.5) * level;
	}
	return out;
}

export function addAt(out: Float32Array, at: number, s: Float32Array, gain: number) {
	const i0 = Math.round(at * SAMPLE_RATE);
	for (let i = 0; i < s.length && i0 + i < out.length; i++) out[i0 + i] += gain * s[i];
}

/** A plucked note: decaying partials plus a short pick noise. */
export function note(midi: number) {
	const s = pluckSamples(
		MIDI_FREQ(midi),
		[
			{ amp: 1, decay: 2.5 },
			{ amp: 0.6, decay: 3.5 },
			{ amp: 0.3, decay: 5 },
			{ amp: 0.15, decay: 6 }
		],
		1.6
	);
	const pick = noise(0.004, 0.6);
	for (let i = 0; i < pick.length; i++) s[i] += pick[i];
	return s;
}

/** Three passes of the exercise after the count-in, `wrong` notes (indexes) a minor third up. */
export function exerciseWav(wrong: number[] = []) {
	const out = noise(COUNT_IN + 3 * PASS + 2);
	for (let pass = 0; pass < 3; pass++)
		NOTES.forEach(([beat, midi], i) => {
			const t = START_SKEW_S + COUNT_IN + pass * PASS + beat * BEAT + LATENCY_MS / 1000;
			addAt(out, t, note(wrong.includes(i) ? midi + 3 : midi), 0.35);
		});
	return out;
}

/**
 * The timing test: alphaTab's metronome, 10 clicks at 80 BPM (two to get ready, eight measured)
 * from about when the stream opens, heard `ms` late. The second take misses one click and has a
 * stray one (outliers). Chromium's fake capture adds its own input latency (FAKE_INPUT_MS), which
 * a real device's measurement includes too.
 */
export const CAL_MS = [120, 260];
export function clicksWav(ms: number, outliers = false) {
	const out = noise(12);
	const click = Float32Array.from(
		{ length: Math.round(0.03 * SAMPLE_RATE) },
		(_, i) =>
			Math.sin((2 * Math.PI * 1500 * i) / SAMPLE_RATE) * Math.exp(-i / (0.006 * SAMPLE_RATE))
	);
	for (let i = 0; i < 10; i++) {
		if (outliers && i === 7) continue;
		addAt(out, ms / 1000 + i * 0.75 + (outliers && i === 4 ? 0.3 : 0), click, 0.6);
	}
	return out;
}

export const WAVS = {
	exerciseGood: () => exerciseWav(),
	/** A quiet room: the learner is not playing (or the mic hears nothing). */
	silence: () => noise(COUNT_IN + 3 * PASS + 2, 0.0006),
	exerciseWrong: () => exerciseWav([2, 5, 9, 12]),
	clicksA: () => clicksWav(CAL_MS[0]),
	clicksB: () => clicksWav(CAL_MS[1], true)
};
export type Wav = keyof typeof WAVS;
export const wavPath = (w: Wav) => path.join(FIXTURES, `m7-${w}.wav`);

/** Writes the fake-mic WAVs (call from test.beforeAll). */
export function writeWavs() {
	for (const [name, make] of Object.entries(WAVS)) writeWav(wavPath(name as Wav), make());
}

export async function fakeMicPage(
	browserType: BrowserType,
	wav: Wav,
	use: TestInfo['project']['use']
) {
	const browser = await browserType.launch({
		executablePath,
		args: [
			'--use-fake-device-for-media-stream',
			'--use-fake-ui-for-media-stream',
			'--autoplay-policy=no-user-gesture-required',
			`--use-file-for-fake-audio-capture=${wavPath(wav)}`
		]
	});
	const context = await browser.newContext({
		baseURL: use.baseURL,
		viewport: use.viewport,
		isMobile: use.isMobile,
		hasTouch: use.hasTouch,
		userAgent: use.userAgent,
		deviceScaleFactor: use.deviceScaleFactor,
		colorScheme: 'dark',
		serviceWorkers: 'block'
	});
	return { page: await context.newPage(), close: () => browser.close() };
}

/** Listen on, explained and calibrated (the stored latency the WAV was made with). */
export async function listenReady(page: Page) {
	await page.goto('./');
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
	await page.goto('practice/exercise/first-notes-e-b');
	await expect(page.getByTestId('listen-toggle')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByTestId('ladder-panel')).toHaveAttribute('data-listen', 'notes');
	await expect(page.getByTestId('ladder-bpm')).toHaveText(String(BPM));
	await expect(page.getByTestId('play-button')).toBeEnabled({ timeout: 30_000 });
}
