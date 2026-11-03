// Pitch helpers shared by the tuner, the chord library and the synth (equal temperament, A4 = 440 Hz).

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export const A4 = 440;
export const A4_MIDI = 69;

export function midiToFreq(midi: number): number {
	return A4 * 2 ** ((midi - A4_MIDI) / 12);
}

/** Fractional MIDI number of a frequency (69 = A4). */
function freqToMidi(freq: number): number {
	return A4_MIDI + 12 * Math.log2(freq / A4);
}

/** Pitch class (0 = C) of a note name such as "F#", "Bb" or "E". */
export function pitchClass(name: string): number {
	const m = /^([A-G])(#|b)?$/.exec(name);
	if (!m) throw new Error(`Bad note name: ${name}`);
	return (LETTER_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
}

/** Splits a scientific-pitch note such as "F#3" into its name ("F#") and octave (3). */
export function parseNote(note: string): { name: string; octave: number } {
	const m = /^([A-G][#b]?)(-?\d)$/.exec(note);
	if (!m) throw new Error(`Bad note: ${note}`);
	return { name: m[1], octave: Number(m[2]) };
}

/** MIDI number of a scientific-pitch note such as "E2", "F#3" or "Bb4". */
export function noteToMidi(note: string): number {
	const { name, octave } = parseNote(note);
	return pitchClass(name) + (octave + 1) * 12;
}

/** Cents from `ref` to `freq` (positive = sharp). */
export function centsBetween(freq: number, ref: number): number {
	return 1200 * Math.log2(freq / ref);
}

export type NoteReading = {
	/** e.g. "E" or "F#" */
	name: string;
	octave: number;
	/** Nearest equal-tempered MIDI note. */
	midi: number;
	/** Offset from that note, -50..+50 (positive = sharp). */
	cents: number;
};

/** Nearest chromatic note of a frequency and how far off it is. */
export function freqToNote(freq: number): NoteReading {
	const exact = freqToMidi(freq);
	const midi = Math.round(exact);
	return {
		name: SHARP_NAMES[((midi % 12) + 12) % 12],
		octave: Math.floor(midi / 12) - 1,
		midi,
		cents: (exact - midi) * 100
	};
}
