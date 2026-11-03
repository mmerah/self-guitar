import { describe, expect, it } from 'vitest';
import { PitchDetector } from 'pitchy';
import { renderPluck } from '../../src/lib/audio/pluck';
import {
	centsBetween,
	freqToNote,
	midiToFreq,
	noteToMidi,
	pitchClass
} from '../../src/lib/music/notes';
import { foldToOctaveOf, median, PitchTracker, rmsOf } from '../../src/lib/tuner/pitch';
import { decayingFundamental, SAMPLE_RATE } from '../fixtures/pluck';

const WINDOW = 4096; // as in the tuner page
import { getTuning, nearestString, stringFreqs, TUNINGS } from '../../src/lib/tuner/tunings';

describe('note helpers', () => {
	it('converts between note names, MIDI and frequency', () => {
		expect(noteToMidi('A4')).toBe(69);
		expect(noteToMidi('E2')).toBe(40);
		expect(noteToMidi('F#3')).toBe(54);
		expect(noteToMidi('Bb3')).toBe(58);
		expect(midiToFreq(69)).toBe(440);
		expect(midiToFreq(40)).toBeCloseTo(82.41, 2);
		expect(pitchClass('Eb')).toBe(3);
	});

	it('reads the nearest note and cents offset of a frequency', () => {
		expect(freqToNote(82.41)).toMatchObject({ name: 'E', octave: 2, midi: 40 });
		expect(Math.abs(freqToNote(82.41).cents)).toBeLessThan(1);
		expect(freqToNote(110)).toMatchObject({ name: 'A', octave: 2, cents: 0 });
		const sharp = freqToNote(440 * 2 ** (10 / 1200));
		expect(sharp.name).toBe('A');
		expect(sharp.cents).toBeCloseTo(10, 6);
		const flat = freqToNote(196 * 2 ** (-30 / 1200));
		expect(flat).toMatchObject({ name: 'G', octave: 3 });
		expect(flat.cents).toBeCloseTo(-30, 1); // G3 is 195.998 Hz
		// Just over half a semitone above E is read as F, flat.
		expect(freqToNote(82.41 * 2 ** (60 / 1200))).toMatchObject({ name: 'F' });
		expect(centsBetween(880, 440)).toBe(1200);
	});
});

describe('tunings', () => {
	it('lists the five tunings with six strings each', () => {
		expect(TUNINGS.map((t) => t.name)).toEqual([
			'Standard',
			'Drop D',
			'DADGAD',
			'Open G',
			'Open D'
		]);
		for (const t of TUNINGS) expect(t.notes).toHaveLength(6);
		expect(getTuning('nope').id).toBe('standard');
	});

	it('finds the nearest string and its offset', () => {
		const std = getTuning('standard');
		expect(nearestString(82.41, std).index).toBe(0);
		expect(nearestString(110, std).index).toBe(1);
		expect(nearestString(215, std).index).toBe(3); // between G3 (196) and B3 (247)
		const flatLowE = nearestString(80, std);
		expect(flatLowE.index).toBe(0);
		expect(flatLowE.cents).toBeLessThan(-40);
		// Drop D: a low E is closest to the dropped D string, 200 cents sharp.
		const dropD = nearestString(82.41, getTuning('drop-d'));
		expect(dropD.index).toBe(0);
		expect(dropD.cents).toBeCloseTo(200, 0);
		// Absolute pitch, not pitch class: D2 is string 6, D3 string 4.
		expect(nearestString(73.4, getTuning('drop-d')).index).toBe(0);
		expect(nearestString(146.8, getTuning('drop-d')).index).toBe(2);
		expect(stringFreqs(getTuning('open-d'))[3]).toBeCloseTo(185, 0); // F#3
	});
});

describe('pitch tracker', () => {
	it('medians, folds octaves and gates on clarity', () => {
		expect(median([3, 1, 2])).toBe(2);
		expect(median([4, 1, 3, 2])).toBe(2.5);
		expect(foldToOctaveOf(220, 110)).toBe(110);
		expect(foldToOctaveOf(41.2, 82.4)).toBeCloseTo(82.4);

		const t = new PitchTracker();
		expect(t.push(110, 0.95)).toBeNull(); // needs two frames
		expect(t.push(110.5, 0.95)).toBeCloseTo(110.25);
		expect(t.push(20, 0.99)).toBeNull(); // out of guitar range
	});

	it('never medians an octave pair (220 then 110 is A2, not 165 Hz)', () => {
		const t = new PitchTracker();
		t.push(220, 0.97);
		expect(t.push(110, 0.97)).toBeCloseTo(110);
	});

	it('corrects an octave error in the first frames of a note', () => {
		const t = new PitchTracker();
		const out = [164.8, 164.8, 164.8, 82.4, 82.4, 82.4, 82.4].map((f) => t.push(f, 0.97));
		expect(out.slice(3).every((f) => f !== null && Math.abs(f - 82.4) < 0.1)).toBe(true);
	});

	it('holds the note through a clarity dip, forgets it after the sound stops', () => {
		const t = new PitchTracker({ resetAfter: 4 });
		for (let i = 0; i < 20; i++) t.push(82.4, 0.99);
		expect(t.push(300, 0.5)).toBeNull(); // unclear: no reading...
		expect(t.push(164.8, 0.95)).toBeCloseTo(82.4); // ...but the held E2 survives it
		for (let i = 0; i < 4; i++) t.push(0, 0);
		t.push(164.8, 0.95);
		expect(t.push(164.8, 0.95)).toBeCloseTo(164.8); // new note after silence
	});

	it('holds the octave for the whole note; a new pluck re-anchors', () => {
		const t = new PitchTracker();
		let rms = 0.3;
		for (let i = 0; i < 30; i++) t.push(82.4, 0.99, { rms: (rms *= 0.98) });
		for (let i = 0; i < 150; i++)
			expect(t.push(164.8, 0.97, { rms: (rms *= 0.98) })).toBeCloseTo(82.4);
		// Onset (the level jumps back up): an E3 is really played now.
		let last: number | null = null;
		for (let i = 0; i < 10; i++) last = t.push(164.8, 0.97, { rms: 0.3 });
		expect(last).toBeCloseTo(164.8);
		// Without level information, only a very long steady shift is believed.
		const u = new PitchTracker({ octaveHold: 10 });
		for (let i = 0; i < 5; i++) u.push(110, 0.97);
		for (let i = 0; i < 9; i++) expect(u.push(220, 0.97)).toBeCloseTo(110);
		u.push(220, 0.97);
		expect(u.push(220, 0.97)).toBeCloseTo(220);
	});

	it('folds towards a locked string and resets on a string change', () => {
		const t = new PitchTracker();
		t.push(164.8, 0.95, { target: 82.41 });
		expect(t.push(164.8, 0.95, { target: 82.41 })).toBeCloseTo(82.4, 1);
		const u = new PitchTracker();
		u.push(110, 0.95);
		u.push(110, 0.95);
		u.push(147, 0.95); // D string now: old A readings must not drag the median
		expect(u.push(147, 0.95)).toBeCloseTo(147);
	});
});

/** Runs samples through the tuner's detector (4096 window, ~60 fps hop) and tracker. */
function tune(samples: Float32Array, target?: number) {
	const detector = PitchDetector.forFloat32Array(WINDOW);
	detector.minVolumeDecibels = -50;
	const tracker = new PitchTracker();
	const out: number[] = [];
	for (let end = WINDOW; end <= samples.length; end += 800) {
		const frame = samples.subarray(end - WINDOW, end);
		const [f, clarity] = detector.findPitch(frame, SAMPLE_RATE);
		const r = tracker.push(f, clarity, { rms: rmsOf(frame), target });
		if (r !== null) out.push(r);
	}
	return out;
}

describe('decaying low string (fundamental dies first)', () => {
	it.each([
		['E2', 'standard', 0],
		['D2', 'drop-d', 0]
	])('%s stays on its own string for the whole decay (%s)', (note, tuningId, string) => {
		const freq = midiToFreq(noteToMidi(note));
		const pluck = decayingFundamental(freq);
		// Twice in a row, as a looping microphone or a re-pluck delivers it.
		const twice = new Float32Array(pluck.length * 2);
		twice.set(pluck);
		twice.set(pluck, pluck.length);
		const readings = tune(twice);
		expect(readings.length).toBeGreaterThan(300);
		const tuning = getTuning(tuningId);
		for (const r of readings) {
			expect(Math.abs(centsBetween(r, freq))).toBeLessThan(10);
			expect(nearestString(r, tuning).index).toBe(string);
		}
		// Without the hold, the detector alone reads the octave above for most of the note.
		const detector = PitchDetector.forFloat32Array(WINDOW);
		const late = detector.findPitch(pluck.subarray(SAMPLE_RATE, SAMPLE_RATE + WINDOW), SAMPLE_RATE);
		expect(Math.abs(centsBetween(late[0], freq * 2))).toBeLessThan(20);
	});

	it('locked to the string, it folds the same way', () => {
		const e2 = midiToFreq(noteToMidi('E2'));
		for (const r of tune(decayingFundamental(e2), e2))
			expect(Math.abs(centsBetween(r, e2))).toBeLessThan(10);
	});
});

describe('plucked reference tone', () => {
	it.each(['E2', 'A2', 'D3', 'G3', 'B3', 'E4'])('%s is in tune within 3 cents', (note) => {
		const freq = midiToFreq(noteToMidi(note));
		const samples = renderPluck(SAMPLE_RATE, freq, 1, 1.5);
		const detector = PitchDetector.forFloat32Array(WINDOW); // the tuner's window and level gate
		detector.minVolumeDecibels = -50;
		const start = SAMPLE_RATE * 0.3;
		const [heard, clarity] = detector.findPitch(
			samples.subarray(start, start + WINDOW),
			SAMPLE_RATE
		);
		expect(clarity).toBeGreaterThan(0.9);
		expect(Math.abs(centsBetween(heard, freq))).toBeLessThan(3);
	});
});
