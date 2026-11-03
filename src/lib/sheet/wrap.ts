// Lyric lines laid out for wrapping (the sheet view): chords stay over their syllables.
import type { Segment, SheetLine } from './chordpro.ts';

/**
 * A lyric line as wrap units: each word with the chord(s) above it, a word split by a chord
 * ("Si[G]lent") kept whole. The line wraps between units, so a chord stays over its syllable.
 */
export function wrapUnits(line: SheetLine): Segment[][] {
	const out: Segment[][] = [];
	let cur: Segment[] = [];
	let open = false; // the last text ended inside a word
	for (const seg of line) {
		const words = seg.text.match(/\S+\s*|\s+/g) ?? [''];
		words.forEach((w, i) => {
			if (!(i === 0 && open) && cur.length) {
				out.push(cur);
				cur = [];
			}
			cur.push({ chord: i === 0 ? seg.chord : null, text: w });
			open = w !== '' && !/\s$/.test(w);
		});
	}
	if (cur.length) out.push(cur);
	return out;
}
