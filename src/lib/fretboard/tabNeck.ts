// "What do my hands do" for a single-note tab (a warm-up's run, an exercise): the places on the
// neck it plays, as fretboard dots, fingered one finger per fret when they fit one hand position.
// Pure. Chord tabs and alternate tunings give null (chord diagrams / the tab say it better).
import { midiAt, type Dot, type Finger } from '../theory/fretboard.ts';
import { pcName } from '../theory/notes.ts';

export type TabNeck = { dots: Dot[]; window: [number, number]; fingered: boolean };

/** The positions a single-note alphaTex tab plays (null: chords, a retuned score, < 3 places). */
export function tabNeck(tex: string): TabNeck | null {
	if (/\\tuning\b/.test(tex) || /\(/.test(tex.replace(/^\s*\\.*$/gm, ''))) return null;
	const body = tex
		.split('\n')
		.filter((l) => !/^\s*\\(?!ts\b)/.test(l))
		.join(' ')
		// Bar-level metadata inside the music ("\ts (6 8)", "\tempo 90").
		.replace(/\\\w+\s*(\([^)]*\)|\d+)?/g, ' ');
	const seen = new Map<string, Dot>();
	for (const m of body.matchAll(/(?<![\d.])(\d{1,2})\.([1-6])(?![\d])/g)) {
		const fret = Number(m[1]);
		const string = Number(m[2]);
		if (fret > 20) continue;
		const key = `${string}:${fret}`;
		if (!seen.has(key)) {
			const midi = midiAt(string, fret);
			seen.set(key, { string, fret, midi, name: pcName(midi), root: false });
		}
	}
	let dots = [...seen.values()];
	if (dots.length < 3) return null;
	const frets = dots.map((d) => d.fret);
	const fretted = frets.filter((f) => f > 0);
	const base = fretted.length ? Math.min(...fretted) : 1;
	const fingered = !fretted.length || Math.max(...fretted) - base <= 3;
	if (fingered)
		dots = dots.map((d) => (d.fret === 0 ? d : { ...d, finger: (d.fret - base + 1) as Finger }));
	const lo = Math.min(...frets);
	const hi = Math.max(...frets);
	return {
		dots: dots.sort((a, b) => a.midi - b.midi),
		window: [lo === 0 ? 0 : Math.max(0, lo - 1), Math.max(hi + 1, lo + 4)],
		fingered
	};
}
