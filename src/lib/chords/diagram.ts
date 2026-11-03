// Voicing -> svguitar chart. Colours come from CSS (currentColor + .finger-N classes), so the
// diagrams follow the theme and the shared finger colours without re-rendering.
import type { Chord as SvgChord, ChordSettings, Finger } from 'svguitar';
import type { Voicing } from './model';

const FRETS_SHOWN = 4;
/** svguitar numbers strings from the high e (1) to the low E (6). */
const svgString = (i: number) => 6 - i;

/** First fret drawn: 1 when the voicing fits in the first four frets, else its lowest fret. */
export function startFret(v: Voicing): number {
	const fretted = v.frets.filter((f): f is number => f !== null && f > 0);
	if (!fretted.length || Math.max(...fretted) <= FRETS_SHOWN) return 1;
	return v.barre?.fret ?? Math.min(...fretted);
}

/**
 * `mini`: a small inline diagram (~80 px wide, the exercise strip): bigger dots and finger
 * numbers, so they stay legible at that size.
 */
export function toSvguitar(v: Voicing, mini = false): { chord: SvgChord; settings: ChordSettings } {
	const position = startFret(v);
	const fingers: Finger[] = [];
	v.frets.forEach((f, i) => {
		if (f === null) fingers.push([svgString(i), 'x']);
		else if (f === 0) fingers.push([svgString(i), 0]);
		else {
			const finger = v.fingers[i];
			const onBarre =
				v.barre && f === v.barre.fret && finger === 1 && i >= v.barre.from && i <= v.barre.to;
			if (!onBarre)
				fingers.push([
					svgString(i),
					f - position + 1,
					{ text: String(finger), className: `finger-${finger}` }
				]);
		}
	});
	const barres = v.barre
		? [
				{
					fromString: svgString(v.barre.from),
					toString: svgString(v.barre.to),
					fret: v.barre.fret - position + 1,
					text: '1',
					className: 'finger-1'
				}
			]
		: [];
	// Minis show only the frets in use (at least 3): open chords fit in 3, and the diagram is shorter.
	const span = Math.max(0, ...v.frets.map((f) => (f ?? 0) - position + 1));
	return {
		chord: { fingers, barres, position },
		settings: {
			frets: mini ? Math.min(FRETS_SHOWN, Math.max(3, span)) : FRETS_SHOWN,
			color: 'currentColor',
			fontFamily: 'system-ui, -apple-system, sans-serif',
			fingerSize: mini ? 1 : 0.9,
			// >= 12 CSS px on a 2-column phone grid (svg ~147px wide); ~10 px on an 80px mini.
			fingerTextSize: mini ? 56 : 34,
			fingerStrokeWidth: 0,
			barreChordRadius: 0.5,
			nutWidth: 9,
			fretLabelFontSize: mini ? 44 : 30,
			emptyStringIndicatorSize: mini ? 0.7 : 0.55,
			strokeWidth: mini ? 3 : 2,
			sidePadding: mini ? 0.12 : 0.18
		}
	};
}
