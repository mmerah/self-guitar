import fs from 'node:fs';
import path from 'node:path';
import { decayingFundamental, SAMPLE_RATE, sine } from '../fixtures/pluck';

/** Writes mono 16-bit PCM samples as a WAV (Chromium loops it as the fake microphone). */
export function writeWav(file: string, samples: Float32Array, sampleRate = SAMPLE_RATE) {
	const n = samples.length;
	const buf = Buffer.alloc(44 + n * 2);
	buf.write('RIFF', 0);
	buf.writeUInt32LE(36 + n * 2, 4);
	buf.write('WAVE', 8);
	buf.write('fmt ', 12);
	buf.writeUInt32LE(16, 16);
	buf.writeUInt16LE(1, 20); // PCM
	buf.writeUInt16LE(1, 22); // mono
	buf.writeUInt32LE(sampleRate, 24);
	buf.writeUInt32LE(sampleRate * 2, 28);
	buf.writeUInt16LE(2, 32);
	buf.writeUInt16LE(16, 34);
	buf.write('data', 36);
	buf.writeUInt32LE(n * 2, 40);
	for (let i = 0; i < n; i++)
		buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, buf);
	return file;
}

const FIXTURES = path.resolve('test-results/fixtures');

/** Fake-microphone recordings, generated once per run by the global setup. */
export const MIC_WAVS = {
	sineE2: () => sine(82.41),
	sineA2: () => sine(110),
	/** Low E whose fundamental dies first: the octave-error trap (must stay E2). */
	pluckE2: () => decayingFundamental(82.4069),
	pluckD2: () => decayingFundamental(73.4162),
	/** A2, 20 cents flat (screenshots). */
	flatA2: () => sine(110 * 2 ** (-20 / 1200))
};
export type MicWav = keyof typeof MIC_WAVS;

export const micWavPath = (name: MicWav) => path.join(FIXTURES, `${name}.wav`);

export function writeMicWavs() {
	for (const [name, make] of Object.entries(MIC_WAVS)) writeWav(micWavPath(name as MicWav), make());
}
