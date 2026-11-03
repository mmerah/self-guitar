// The Self-Guitar ChordPro subset (docs/research/m5/chordpro-design.md): song.cho → a Sheet (lyrics
// with chords, sections, the bar grid and the strum), strictly validated. Pure and browser-safe;
// content:build compiles every song.cho with it and the sheet view reads the result.
import { parseStrum } from '../learn/strum.ts';
import { resolveChord } from './chords.ts';

export const TIMES = ['2/4', '3/4', '4/4', '6/8'] as const;
export type TimeSig = (typeof TIMES)[number];
/** 8th-note strum slots per bar. */
export const SLOTS: Record<TimeSig, number> = { '2/4': 4, '3/4': 6, '4/4': 8, '6/8': 6 };
export const LYRIC_MAX = 48;

export type Segment = { chord: string | null; text: string };
export type SheetLine = Segment[];
export type SectionType = 'verse' | 'chorus' | 'bridge';
export type SheetBlock =
	| {
			type: SectionType;
			label: string;
			lines: SheetLine[];
			/** Bars of each line; each bar is its cells (one chord name or "." per cell). */
			grid: string[][][];
			strum: string;
			/** A `{chorus}` recall: the last chorus again. */
			recall?: boolean;
	  }
	| { type: 'comment'; text: string };

/**
 * What plays in one bar: the block and line it belongs to, and the chord sounding in each cell.
 * `p`: a pickup bar of that many 8th-note slots (sung before the first chord; nothing strummed).
 */
export type BarInfo = { b: number; l: number; c: string[]; p?: number };

export type Sheet = {
	title: string;
	composer: string | null;
	key: string;
	capo: number;
	tempo: number;
	time: TimeSig;
	level: number | null;
	strum: string;
	/** Final ring-out chord (one whole bar), if any. */
	end: string | null;
	/** Pinned voicings, chord name → voicing id ("G" → "3-2-0-0-3-3"). */
	voicings: Record<string, string>;
	blocks: SheetBlock[];
	/** Chords in order of first use (canonical names). */
	chords: string[];
	/** One entry per bar of the accompaniment, in playing order (the end chord is b = -1). */
	bars: BarInfo[];
	/** 8th-note slots of the pickup (lyrics before the first chord), 0 when the song has none. */
	pickup: number;
};

export type ParseResult = { sheet: Sheet | null; errors: string[]; warnings: string[] };

const SECTION: Record<string, { type: SectionType; end: boolean }> = {
	start_of_verse: { type: 'verse', end: false },
	sov: { type: 'verse', end: false },
	end_of_verse: { type: 'verse', end: true },
	eov: { type: 'verse', end: true },
	start_of_chorus: { type: 'chorus', end: false },
	soc: { type: 'chorus', end: false },
	end_of_chorus: { type: 'chorus', end: true },
	eoc: { type: 'chorus', end: true },
	start_of_bridge: { type: 'bridge', end: false },
	sob: { type: 'bridge', end: false },
	end_of_bridge: { type: 'bridge', end: true },
	eob: { type: 'bridge', end: true }
};
const ALIAS: Record<string, string> = {
	t: 'title',
	c: 'comment',
	sog: 'start_of_grid',
	eog: 'end_of_grid'
};
const HEADER = ['title', 'composer', 'artist', 'lyricist', 'key', 'capo', 'tempo', 'time'];
const OWN = ['x_strum', 'x_level', 'x_end', 'x_voicing'];
const TYPE_LABEL: Record<SectionType, string> = {
	verse: 'Verse',
	chorus: 'Chorus',
	bridge: 'Bridge'
};

/** `{name: value}` / `{name label="x"}` / `{name}` → [name, value, label]. */
function directive(line: string): [string, string, string | null] | null {
	const m =
		/^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i.exec(line) ??
		/^\{\s*([a-z_]+)\s+(.*?)\s*\}$/i.exec(line);
	if (!m) return null;
	const name = m[1].toLowerCase();
	const value = (m[2] ?? '').trim();
	const label = /^label\s*=\s*"([^"]*)"$/.exec(value)?.[1] ?? null;
	return [ALIAS[name] ?? name, value, label];
}

/** "[Am]Are you going to [Em]Scarborough" → segments. */
export function parseLyric(line: string): SheetLine {
	const out: SheetLine = [];
	const re = /\[([^\]]*)\]/g;
	let last = 0;
	let chord: string | null = null;
	for (const m of line.matchAll(re)) {
		const text = line.slice(last, m.index);
		if (text || chord !== null) out.push({ chord, text });
		chord = m[1].trim();
		last = m.index! + m[0].length;
	}
	const rest = line.slice(last);
	if (rest || chord !== null || !out.length) out.push({ chord, text: rest });
	return out;
}

/** "| Am . . | Em . . |" → [["Am", ".", "."], ["Em", ".", "."]]. */
export function parseGridLine(line: string): string[][] {
	return line
		.split('|')
		.map((bar) => bar.trim())
		.filter(Boolean)
		.map((bar) => bar.split(/\s+/).map((c) => (c === '/' ? '.' : c)));
}

/** Syllables in a stretch of lyrics (vowel groups per word, a silent final e dropped). */
export function syllables(text: string): number {
	return text
		.toLowerCase()
		.split(/[^a-z']+/)
		.filter(Boolean)
		.reduce((n, w) => {
			const groups = w.replace(/(?<=[^aeiouy])e$/, '').match(/[aeiouy]+/g)?.length ?? 0;
			return n + Math.max(1, groups);
		}, 0);
}

/**
 * The pickup a sheet starts with: lyrics before the first chord of the first line are sung as an
 * upbeat. Its length in 8th-note slots, guessed from the syllables: one 8th each in 6/8; in simple
 * time one beat for one or two syllables, then a beat per two. Always shorter than a bar.
 */
export function pickupSlots(firstLine: SheetLine | undefined, time: TimeSig): number {
	const lead = firstLine?.[0];
	if (!lead || lead.chord !== null || !lead.text.trim() || firstLine.length < 2) return 0;
	const n = syllables(lead.text);
	if (!n) return 0;
	const bar = SLOTS[time];
	const want = time === '6/8' ? n : 2 * Math.ceil(n / 2);
	return Math.min(want, time === '6/8' ? bar - 1 : bar - 2);
}

/** Chord changes in a sequence (repeats collapsed). */
const changes = (names: string[]) => names.filter((c, i) => c !== names[i - 1]);

export function parseChordPro(src: string): ParseResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const head: Record<string, string> = {};
	const voicings: Record<string, string> = {};
	const grids = new Map<string, string[][][]>();
	const blocks: SheetBlock[] = [];
	let fileStrum: string | null = null;
	let end: string | null = null;
	let level: number | null = null;
	let open: {
		type: SectionType;
		label: string;
		lines: SheetLine[];
		strum: string | null;
		grid: string[][][] | null;
		at: number;
	} | null = null;
	let grid: { label: string; lines: string[][][]; at: number } | null = null;
	let lastChorus: Extract<SheetBlock, { type: SectionType }> | null = null;
	/** `{chorus}` recalls: their index in `blocks` and the chorus they repeat (grids come later). */
	const recalls: [number, Extract<SheetBlock, { type: SectionType }>][] = [];
	const pending: {
		block: Extract<SheetBlock, { type: SectionType }>;
		grid: string[][][] | null;
		at: number;
	}[] = [];

	/** Canonical chord name, or the name as written with an error. */
	const chordName = (name: string, at: number) => {
		const r = resolveChord(name);
		if (!r) errors.push(`line ${at}: unknown chord "${name}" (not in content/chords.ts)`);
		return r?.name ?? name;
	};

	const lines = src.replace(/\r\n?/g, '\n').split('\n');
	lines.forEach((raw, i) => {
		const at = i + 1;
		const line = raw.trim();
		if (grid) {
			if (/^\{\s*(end_of_grid|eog)\s*\}$/i.test(line)) {
				if (open) open.grid = grid.lines;
				else if (grids.has(grid.label.toLowerCase()))
					errors.push(`line ${at}: grid "${grid.label}" is defined twice`);
				else grids.set(grid.label.toLowerCase(), grid.lines);
				grid = null;
			} else if (line && !line.startsWith('#')) {
				const bars = parseGridLine(line).map((bar) =>
					bar.map((c) => (c === '.' ? c : chordName(c, at)))
				);
				if (!bars.length) errors.push(`line ${at}: grid line has no bars`);
				grid.lines.push(bars);
			}
			return;
		}
		if (!line || line.startsWith('#')) return;
		const d = line.startsWith('{') ? directive(line) : null;
		if (line.startsWith('{') && !d) {
			errors.push(`line ${at}: malformed directive "${line}"`);
			return;
		}
		if (!d) {
			if (!open) {
				errors.push(`line ${at}: lyrics outside a verse/chorus/bridge`);
				return;
			}
			const segs = parseLyric(line);
			for (const s of segs) if (s.chord !== null) s.chord = chordName(s.chord, at);
			const text = segs.map((s) => s.text).join('');
			if (text.length > LYRIC_MAX)
				warnings.push(
					`line ${at}: lyric line is ${text.length} characters (max ${LYRIC_MAX} fits a phone)`
				);
			open.lines.push(segs);
			return;
		}
		const [name, value, label] = d;
		const section = SECTION[name];
		if (section && !section.end) {
			if (open) errors.push(`line ${at}: ${name} inside an open ${open.type}`);
			open = {
				type: section.type,
				label: label ?? (value || TYPE_LABEL[section.type]),
				lines: [],
				strum: null,
				grid: null,
				at
			};
			return;
		}
		if (section && section.end) {
			if (!open || open.type !== section.type) {
				errors.push(`line ${at}: ${name} without a matching start`);
				return;
			}
			const block: Extract<SheetBlock, { type: SectionType }> = {
				type: open.type,
				label: open.label,
				lines: open.lines,
				grid: [],
				strum: open.strum ?? fileStrum ?? ''
			};
			if (!open.lines.length) errors.push(`line ${open.at}: empty ${open.type}`);
			if (!block.strum)
				errors.push(`line ${open.at}: no strum pattern ({x_strum: …} before this block)`);
			pending.push({ block, grid: open.grid, at: open.at });
			blocks.push(block);
			if (block.type === 'chorus') lastChorus = block;
			open = null;
			return;
		}
		switch (name) {
			case 'start_of_grid':
				grid = { label: label ?? (value || (open ? open.label : 'Verse')), lines: [], at };
				return;
			case 'end_of_grid':
				errors.push(`line ${at}: end_of_grid without start_of_grid`);
				return;
			case 'chorus': {
				if (open) errors.push(`line ${at}: {chorus} inside a block`);
				else if (!lastChorus) errors.push(`line ${at}: {chorus} before any chorus`);
				else recalls.push([blocks.push({ ...lastChorus, recall: true }) - 1, lastChorus]);
				return;
			}
			case 'comment':
				if (open) errors.push(`line ${at}: put {comment} between blocks`);
				else blocks.push({ type: 'comment', text: value });
				return;
			case 'x_strum': {
				const p = parseStrum(value);
				if ('error' in p) errors.push(`line ${at}: ${p.error}`);
				const strum = 'slots' in p ? p.slots.join(' ') : value;
				if (open) open.strum = strum;
				else if (blocks.length || pending.length)
					errors.push(
						`line ${at}: a file-level x_strum must come before the first block (or put it inside a block)`
					);
				else fileStrum = strum;
				return;
			}
			case 'x_level': {
				const n = Number(value);
				if (!Number.isInteger(n) || n < 0 || n > 9) errors.push(`line ${at}: x_level must be 0–9`);
				else level = n;
				return;
			}
			case 'x_end':
				end = chordName(value, at);
				return;
			case 'x_voicing': {
				const m = /^([^=\s]+)\s*=\s*([0-9x]{6})$/.exec(value);
				if (!m) {
					errors.push(`line ${at}: x_voicing must look like "G=320033"`);
					return;
				}
				const r = resolveChord(m[1]);
				const id = [...m[2]].join('-');
				if (!r) errors.push(`line ${at}: unknown chord "${m[1]}"`);
				else if (!r.chord.voicings.some((v) => v.id === id))
					errors.push(`line ${at}: ${r.name} has no voicing ${m[2]} in content/chords.ts`);
				else voicings[r.name] = id;
				return;
			}
		}
		if (HEADER.includes(name)) {
			if (open) errors.push(`line ${at}: {${name}} belongs in the header`);
			if (name in head) errors.push(`line ${at}: {${name}} given twice`);
			head[name] = value;
			return;
		}
		errors.push(
			`line ${at}: unsupported directive {${name}} (supported: ${[...HEADER, 'start_of_verse/chorus/bridge', 'chorus', 'start_of_grid', 'comment', ...OWN].join(', ')})`
		);
	});
	if (open) errors.push(`line ${(open as { at: number }).at}: block is never closed`);
	if (grid) errors.push(`line ${(grid as { at: number }).at}: grid is never closed`);

	// ---- header ----
	const title = head.title ?? '';
	if (!title) errors.push('missing {title}');
	const key = head.key ?? '';
	if (!key) errors.push('missing {key}');
	else if (!resolveChord(key) || key.includes('/'))
		errors.push(`{key: ${key}} must be a key like G or Am`);
	const capo = head.capo === undefined ? 0 : Number(head.capo);
	if (!Number.isInteger(capo) || capo < 0 || capo > 7) errors.push('{capo} must be 0–7');
	const tempo = Number(head.tempo);
	if (!Number.isInteger(tempo) || tempo < 30 || tempo > 250)
		errors.push('{tempo} must be 30–250 (quarter notes per minute)');
	const time = (head.time ?? '4/4') as TimeSig;
	if (!TIMES.includes(time)) errors.push(`{time} must be one of ${TIMES.join(', ')}`);
	const slots = SLOTS[time] ?? 8;

	// ---- grids, strums and the line ↔ grid check ----
	for (const { block, grid: own, at } of pending) {
		const g =
			own ??
			grids.get(block.label.toLowerCase()) ??
			grids.get(TYPE_LABEL[block.type].toLowerCase());
		if (!g) {
			errors.push(
				`line ${at}: no grid for "${block.label}" (add {start_of_grid label="${TYPE_LABEL[block.type]}"})`
			);
			continue;
		}
		block.grid = g;
		if (g.length !== block.lines.length)
			errors.push(
				`line ${at}: "${block.label}" has ${block.lines.length} lyric lines but its grid has ${g.length}`
			);
		const n = block.strum.split(' ').length;
		if (block.strum && n !== slots && n !== slots * 2)
			errors.push(
				`line ${at}: strum "${block.strum}" has ${n} slots; ${time} needs ${slots} (or ${slots * 2} for two bars)`
			);
		g.forEach((bars, li) =>
			bars.forEach((cells, bi) => {
				if (slots % cells.length)
					errors.push(
						`line ${at}: grid line ${li + 1} bar ${bi + 1} has ${cells.length} cells; ${time} takes 1${[
							2, 3, 4, 6, 8
						]
							.filter((k) => slots % k === 0 && k <= slots)
							.map((k) => `, ${k}`)
							.join('')}`
					);
			})
		);
	}

	for (const [i, chorus] of recalls) blocks[i] = { ...chorus, recall: true };

	// Walk the playing order: resolve every cell, check each line's chords against its grid line.
	const bars: BarInfo[] = [];
	let carried: string | null = null;
	blocks.forEach((block, b) => {
		if (block.type === 'comment' || !block.grid.length) return;
		block.grid.forEach((lineBars, l) => {
			const startCarried = carried;
			const explicit: string[] = [];
			for (const cells of lineBars) {
				const c = cells.map((cell) => {
					if (cell !== '.') carried = cell;
					if (cell !== '.') explicit.push(cell);
					return carried ?? '';
				});
				if (c.some((x) => !x) && !block.recall)
					errors.push(`"${block.label}" line ${l + 1}: the grid starts with "." before any chord`);
				bars.push({ b, l, c });
			}
			if (block.recall) return;
			const lyric = changes((block.lines[l] ?? []).flatMap((s) => (s.chord ? [s.chord] : [])));
			let grid = changes(explicit);
			if (grid.length && lyric[0] !== grid[0] && grid[0] === startCarried) grid = grid.slice(1);
			if (lyric.length && lyric[0] === startCarried && grid[0] !== lyric[0])
				grid = [lyric[0], ...grid];
			if (block.lines[l] && lyric.join(' ') !== grid.join(' '))
				errors.push(
					`"${block.label}" line ${l + 1}: lyric chords [${lyric.join(' ')}] do not match grid chords [${grid.join(' ')}]`
				);
		});
	});
	if (end) bars.push({ b: -1, l: -1, c: [end] });
	if (!blocks.some((b) => b.type !== 'comment')) errors.push('no verse or chorus');
	// A pickup bar before the first: it belongs to the first line (lit while it is sung).
	const firstBlock = blocks.findIndex((b) => b.type !== 'comment');
	const first = blocks[firstBlock];
	const pickup =
		first && first.type !== 'comment' && bars.length
			? pickupSlots(first.lines[0], TIMES.includes(time) ? time : '4/4')
			: 0;
	if (pickup) bars.unshift({ b: firstBlock, l: 0, c: [bars[0].c[0]], p: pickup });

	const chords: string[] = [];
	for (const bar of bars) for (const c of bar.c) if (c && !chords.includes(c)) chords.push(c);

	if (errors.length) return { sheet: null, errors, warnings };
	return {
		sheet: {
			title,
			composer: head.composer ?? head.artist ?? null,
			key: resolveChord(key)!.name,
			capo,
			tempo,
			time,
			level,
			strum: fileStrum ?? (blocks.find((b) => b.type !== 'comment') as { strum: string }).strum,
			end,
			voicings,
			blocks,
			chords,
			bars,
			pickup
		},
		errors,
		warnings
	};
}
