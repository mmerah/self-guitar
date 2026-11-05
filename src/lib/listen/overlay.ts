// Note colours on the tab: an overlay layer of rounded marks over the fret numbers, placed from
// alphaTab's boundsLookup (note bounds) after every render. Restyling notes in the score would
// need a re-render per note (it stutters and resets the cursor); the overlay costs a class change.
import type * as AT from '@coderline/alphatab';
import { noteColour, noteGlyph, type NoteStatus } from './match';

export type MarkColour = 'good' | 'off' | 'bad';

export class NoteOverlay {
	private layer: HTMLDivElement | null = null;
	private marks = new Map<unknown, HTMLElement[]>();
	private barMarks = new Map<number, HTMLElement>();
	/** The last colour and glyph per note (kept across re-renders). */
	private colours = new Map<unknown, { c: MarkColour; g: string; stale: boolean }>();
	private chordState = new Map<number, boolean | null>();

	constructor(private api: AT.AlphaTabApi) {}

	private host(): HTMLElement | null {
		const el = (this.api.container as unknown as { element?: HTMLElement }).element;
		return el ?? null;
	}

	/** Rebuilds the marks from the current layout (call after each render). */
	layout() {
		const host = this.host();
		const lookup = this.api.boundsLookup;
		if (!host || !lookup) return;
		if (!this.layer || this.layer.parentElement !== host) {
			this.layer?.remove();
			this.layer = document.createElement('div');
			this.layer.className = 'sg-listen-layer';
			this.layer.setAttribute('aria-hidden', 'true');
			this.layer.dataset.testid = 'listen-layer';
			host.appendChild(this.layer);
		}
		this.layer.replaceChildren();
		this.marks.clear();
		this.barMarks.clear();
		for (const system of lookup.staffSystems)
			for (const mb of system.bars) {
				for (const bar of mb.bars)
					for (const beat of bar.beats)
						for (const nb of beat.notes ?? []) {
							const b = nb.noteHeadBounds;
							const el = document.createElement('span');
							el.className = 'sg-listen-mark';
							el.style.left = `${b.x - 3}px`;
							el.style.top = `${b.y - 2}px`;
							el.style.width = `${b.w + 6}px`;
							el.style.height = `${b.h + 4}px`;
							this.layer.appendChild(el);
							const list = this.marks.get(nb.note) ?? [];
							list.push(el);
							this.marks.set(nb.note, list);
						}
				if (!this.barMarks.has(mb.index)) {
					const v = mb.visualBounds;
					const el = document.createElement('span');
					el.className = 'sg-listen-bar';
					el.style.left = `${v.x + v.w - 22}px`;
					el.style.top = `${v.y + 2}px`;
					el.dataset.bar = String(mb.index);
					this.layer.appendChild(el);
					this.barMarks.set(mb.index, el);
				}
			}
		for (const [note, v] of this.colours) this.paint(note, v.c, v.g, v.stale);
		for (const [bar, ok] of this.chordState) this.paintBar(bar, ok);
	}

	private paint(note: unknown, c: MarkColour | null, g = '', stale = false) {
		for (const el of this.marks.get(note) ?? []) {
			if (c) {
				el.dataset.status = c;
				el.dataset.glyph = g;
			} else {
				delete el.dataset.status;
				delete el.dataset.glyph;
			}
			el.classList.toggle('stale', stale);
		}
	}

	private paintBar(bar: number, ok: boolean | null) {
		const el = this.barMarks.get(bar);
		if (!el) return;
		el.textContent = ok === null ? '' : ok ? '✓' : '✗';
		if (ok === null) delete el.dataset.status;
		else el.dataset.status = ok ? 'good' : 'bad';
	}

	/** A new pass: last pass's marks fade until each note is heard again. */
	fade() {
		for (const [note, v] of this.colours) {
			v.stale = true;
			this.paint(note, v.c, v.g, true);
		}
	}

	/** Colours the notes of a pass: `refs[i]` is the alphaTab note of result `statuses[i]`. */
	show(refs: readonly unknown[], statuses: readonly NoteStatus[]) {
		statuses.forEach((s, i) => {
			const c = noteColour(s);
			const g = noteGlyph(s) ?? '';
			if (!c) return;
			const prev = this.colours.get(refs[i]);
			if (prev && prev.c === c && prev.g === g && !prev.stale) return;
			this.colours.set(refs[i], { c, g, stale: false });
			this.paint(refs[i], c, g);
		});
	}

	showChords(bars: readonly { bar: number; ok: boolean | null }[]) {
		for (const { bar, ok } of bars) {
			this.chordState.set(bar, ok);
			this.paintBar(bar, ok);
		}
	}

	clear() {
		this.colours.clear();
		this.chordState.clear();
		for (const note of this.marks.keys()) this.paint(note, null);
		for (const bar of this.barMarks.keys()) this.paintBar(bar, null);
	}

	destroy() {
		this.layer?.remove();
		this.layer = null;
		this.marks.clear();
		this.barMarks.clear();
	}
}
