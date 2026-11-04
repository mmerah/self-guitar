// Lesson body compiler: a deliberately small Markdown subset plus widget directives, turned into a
// JSON block tree at build time. The UI renders the tree with components, so no HTML from lesson
// files ever reaches the page. Anything outside the subset is an authoring error (with its line),
// never silently mis-rendered. Syntax (see content/README.md):
//   ## / ### headings · paragraphs · flat "- " and "1. " lists · **bold** *italic* `code` [text](/link)
//   ::chord{id="g" voicing="3-2-0-0-0-3"} or {id="F@1-3-3-2-1-1"}   ::chords{ids="g,F@1-3-3-2-1-1"}
//   ::exercise{id="..."}   ::strum{pattern="D - D U - U D U" bpm=70 chord="em"} (sub=16: 16ths;
//   ts="6/8": six 8ths counted 1–6)
//   ::tool{name="metronome" bpm=70}
//   ::tip[One line]  ::warning[One line]   or   :::tip ... :::   (multi-paragraph callout)
//   ::fretboard{scale="minor-pentatonic" root="A" box="1"}  ::fretboard{quiz="string-6" target=30}
//   ::ear{kind="intervals" set="P4,P5,P8"}   ::song{id="drunken-sailor" tempo=80}
//   ```atex ... ```  (an inline tab with playback)
import { canonicalChordRef, chordRefProblem, getChord, splitChordRef } from '../chords/index.ts';
import { isStrumTs, parseStrum, STRUM_BPM_MAX, STRUM_BPM_MIN } from './strum.ts';
import { TOOLS, toolProblems } from './tools.ts';
import { parseFretboard } from '../theory/fretboard.ts';
import { isQuiz } from '../fretboard/quiz.ts';
import {
	DEFAULT_SET,
	EAR_DIRS,
	EAR_KINDS,
	PROGRESSION_KEYS,
	isEarKind,
	parseEarSet,
	type EarDir
} from '../ear/items.ts';
import type { Block, Inline, ToolName } from './types.ts';

export type Problem = { line: number; message: string };

// ---- front-matter --------------------------------------------------------------------------------

/** Editors on Windows may save a byte-order mark: it is not content. */
export const stripBom = (src: string) => src.replace(/^\uFEFF/, '');

/** Splits `---\nyaml\n---\nbody`; `bodyLine` is the 1-based line where the body starts. */
export function splitFrontMatter(
	src: string
): { yaml: string; body: string; bodyLine: number } | null {
	src = stripBom(src);
	const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
	if (!m) return null;
	return {
		yaml: m[1],
		body: src.slice(m[0].length),
		bodyLine: m[0].split('\n').length
	};
}

// ---- inline ------------------------------------------------------------------------------------

/** In-app links start with one "/" ("//host" would leave the app). */
export const IN_APP_HREF = /^\/(?!\/)/;
const SAFE_HREF = /^(\/(?!\/)[\w\-./?=&#%]*|https:\/\/[^\s<>"']+)$/;

/** Parses inline Markdown; unbalanced markers are kept as text. */
export function parseInline(src: string, problems: string[] = []): Inline[] {
	const out: Inline[] = [];
	let text = '';
	const flush = () => {
		if (text) out.push({ t: 'text', v: text });
		text = '';
	};
	let i = 0;
	while (i < src.length) {
		const ch = src[i];
		if (ch === '\\' && i + 1 < src.length && /[\\*_`[\]()]/.test(src[i + 1])) {
			text += src[i + 1];
			i += 2;
			continue;
		}
		if (ch === '`') {
			const end = src.indexOf('`', i + 1);
			if (end > i) {
				flush();
				out.push({ t: 'code', v: src.slice(i + 1, end) });
				i = end + 1;
				continue;
			}
		}
		if ((ch === '*' && src[i + 1] === '*') || (ch === '_' && src[i + 1] === '_')) {
			const marker = ch + ch;
			const end = src.indexOf(marker, i + 2);
			if (end > i + 2) {
				flush();
				out.push({ t: 'strong', c: parseInline(src.slice(i + 2, end), problems) });
				i = end + 2;
				continue;
			}
		}
		if (ch === '*' || ch === '_') {
			// An underscore inside a word (snake_case) is text.
			const wordBefore = ch === '_' && /\w/.test(src[i - 1] ?? '');
			const end = src.indexOf(ch, i + 1);
			if (!wordBefore && end > i + 1 && src[i + 1] !== ' ') {
				flush();
				out.push({ t: 'em', c: parseInline(src.slice(i + 1, end), problems) });
				i = end + 1;
				continue;
			}
		}
		if (ch === '[') {
			const m = /^\[([^\]]+)\]\(([^)\s]*)\)/.exec(src.slice(i));
			if (m) {
				flush();
				if (!SAFE_HREF.test(m[2]))
					problems.push(`link "${m[2]}" must start with "/" (in-app, not "//") or "https://"`);
				out.push({ t: 'link', href: m[2], c: parseInline(m[1], problems) });
				i += m[0].length;
				continue;
			}
		}
		text += ch;
		i++;
	}
	flush();
	return out;
}

// ---- directives ----------------------------------------------------------------------------------

/** `{a="x y" b=3}` -> {a: 'x y', b: '3'}; null when the text is not a valid attribute list. */
export function parseAttrs(src: string): Record<string, string> | null {
	const attrs: Record<string, string> = {};
	const re = /\s*([a-zA-Z][\w-]*)=(?:"([^"]*)"|([^\s"}]+))\s*/y;
	let pos = 0;
	while (pos < src.length) {
		re.lastIndex = pos;
		const m = re.exec(src);
		if (!m) return src.slice(pos).trim() ? null : attrs;
		if (m[1] in attrs) return null;
		attrs[m[1]] = m[2] ?? m[3];
		pos = re.lastIndex;
	}
	return attrs;
}

type Attrs = Record<string, string>;

export const DIRECTIVE_NAMES = [
	'chord',
	'chords',
	'exercise',
	'strum',
	'tool',
	'fretboard',
	'ear',
	'song',
	'tip',
	'warning'
];

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A chord reference ("Em", "e-m", "F@1-3-3-2-1-1") in canonical form, or null (problem pushed). */
function chordRef(ref: string, problems: string[]): string | null {
	const problem = chordRefProblem(ref);
	if (problem) problems.push(problem);
	return problem ? null : canonicalChordRef(ref)!;
}

/**
 * Checks a directive's attributes and [label]; false when anything is wrong (problems pushed).
 * `optional: null` accepts any further attribute (validated by the caller).
 */
function expectShape(
	name: string,
	attrs: Attrs,
	label: string | undefined,
	problems: string[],
	shape: { required?: string[]; optional?: string[] | null; label?: 'required' | 'optional' }
): boolean {
	const before = problems.length;
	const required = shape.required ?? [];
	if (shape.optional !== null)
		for (const key of Object.keys(attrs))
			if (![...required, ...(shape.optional ?? [])].includes(key))
				problems.push(`::${name} has no attribute "${key}"`);
	for (const key of required) if (!(key in attrs)) problems.push(`::${name} needs ${key}=`);
	if (!shape.label && label !== undefined) problems.push(`::${name} takes no [label]`);
	if (shape.label === 'required' && !label?.trim()) problems.push(`::${name} needs [text]`);
	return problems.length === before;
}

/** Compiles one leaf directive; problems are pushed (without line numbers). */
function leafDirective(
	name: string,
	label: string | undefined,
	attrs: Attrs,
	problems: string[]
): Block | null {
	switch (name) {
		case 'chord': {
			if (!expectShape(name, attrs, label, problems, { required: ['id'], optional: ['voicing'] }))
				return null;
			const ref = chordRef(attrs.id, problems);
			if (!ref) return null;
			const { name: id, voicing: pinned } = splitChordRef(ref);
			if (pinned !== undefined && attrs.voicing !== undefined)
				problems.push(`::chord: give the voicing once (id="${attrs.id}" already names one)`);
			if (pinned !== undefined) return problems.length ? null : { t: 'chord', id, voicing: pinned };
			if (attrs.voicing === undefined) return { t: 'chord', id };
			const chord = getChord(id)!;
			if (!chord.voicings.some((v) => v.id === attrs.voicing)) {
				problems.push(
					`chord ${id} has no voicing "${attrs.voicing}" (has ${chord.voicings.map((v) => v.id).join(', ')})`
				);
				return null;
			}
			return { t: 'chord', id, voicing: attrs.voicing };
		}
		case 'chords': {
			if (!expectShape(name, attrs, label, problems, { required: ['ids'] })) return null;
			const refs = attrs.ids.split(',').map((s) => s.trim());
			const parts = refs
				.map((r) => chordRef(r, problems))
				.map((r) => (r ? splitChordRef(r) : null));
			if (refs.length < 2 || refs.length > 6) problems.push('::chords takes 2-6 ids');
			if (problems.length) return null;
			const ids = parts.map((p) => p!.name);
			const voicings = parts.map((p) => p!.voicing ?? null);
			return {
				t: 'chords',
				ids,
				...(voicings.some((v) => v !== null) && { voicings })
			};
		}
		case 'exercise':
			if (!expectShape(name, attrs, label, problems, { required: ['id'] })) return null;
			if (!SLUG.test(attrs.id)) problems.push(`exercise id "${attrs.id}" must be kebab-case`);
			return problems.length ? null : { t: 'exercise', id: attrs.id };
		case 'strum': {
			const shape = { required: ['pattern', 'bpm'], optional: ['chord', 'sub', 'ts'] };
			if (!expectShape(name, attrs, label, problems, shape)) return null;
			if (attrs.sub !== undefined && attrs.sub !== '8' && attrs.sub !== '16')
				problems.push('strum sub must be 8 (8th notes, the default) or 16');
			if (attrs.ts !== undefined && !isStrumTs(attrs.ts))
				problems.push('strum ts must be "6/8" (simple meters follow from the pattern length)');
			const ts = attrs.ts !== undefined && isStrumTs(attrs.ts) ? attrs.ts : undefined;
			const parsed = parseStrum(attrs.pattern, attrs.sub === '16' ? 16 : undefined, ts);
			if ('error' in parsed) problems.push(parsed.error);
			const bpm = Number(attrs.bpm);
			if (!/^\d+$/.test(attrs.bpm) || bpm < STRUM_BPM_MIN || bpm > STRUM_BPM_MAX)
				problems.push(`strum bpm must be a whole number ${STRUM_BPM_MIN}-${STRUM_BPM_MAX}`);
			const chord = attrs.chord === undefined ? undefined : chordRef(attrs.chord, problems);
			if (problems.length || 'error' in parsed) return null;
			return {
				t: 'strum',
				pattern: parsed.slots,
				bpm,
				...(chord && { chord }),
				...(parsed.sub === 16 && { sub: 16 as const }),
				...(parsed.ts && { ts: parsed.ts })
			};
		}
		case 'tool': {
			// Each tool has its own attributes (TOOLS); `name` picks the tool.
			const shape = { required: ['name'], optional: null, label: 'optional' as const };
			if (!expectShape(name, attrs, label, problems, shape)) return null;
			const { name: tool, ...params } = attrs;
			const spec = TOOLS[tool as ToolName];
			if (!spec) {
				problems.push(`unknown tool "${tool}" (use ${Object.keys(TOOLS).join(', ')})`);
				return null;
			}
			for (const [k, v] of Object.entries(params)) {
				const check = spec.params[k];
				if (!check) problems.push(`::tool ${tool} has no attribute "${k}"`);
				else {
					const problem = check(v);
					if (problem) problems.push(`::tool ${tool} ${k}: ${problem}`);
				}
			}
			for (const k of spec.required)
				if (!(k in params)) problems.push(`::tool ${tool} needs ${k}=`);
			const changeChord = (ref = '') => getChord(splitChordRef(ref).name)?.id;
			if (tool === 'changes' && changeChord(params.a) === changeChord(params.b))
				problems.push('::tool changes needs two different chords');
			problems.push(...toolProblems(tool as ToolName, params));
			if (problems.length) return null;
			return { t: 'tool', name: tool as ToolName, params, ...(label && { label }) };
		}
		case 'fretboard': {
			if ('quiz' in attrs) {
				const shape = { required: ['quiz'], optional: ['target'] };
				if (!expectShape(name, attrs, label, problems, shape)) return null;
				if (!isQuiz(attrs.quiz))
					problems.push(
						`unknown quiz "${attrs.quiz}" (use string-1…string-6, strings-6-5, all, note-C…)`
					);
				const target = attrs.target === undefined ? undefined : Number(attrs.target);
				if (target !== undefined && !(/^\d+$/.test(attrs.target) && target >= 5 && target <= 600))
					problems.push('fretboard quiz target must be 5-600 seconds');
				if (problems.length) return null;
				return { t: 'fretquiz', quiz: attrs.quiz, ...(target !== undefined && { target }) };
			}
			const spec = parseFretboard(attrs, problems);
			return spec ? { t: 'fretboard', spec, ...(label?.trim() && { label: label.trim() }) } : null;
		}
		case 'ear': {
			const shape = { required: ['kind'], optional: ['set', 'dir', 'n', 'key'] };
			if (!expectShape(name, attrs, label, problems, shape)) return null;
			if (!isEarKind(attrs.kind)) {
				problems.push(`unknown ear kind "${attrs.kind}" (use ${EAR_KINDS.join(', ')})`);
				return null;
			}
			const kind = attrs.kind;
			const set =
				attrs.set === undefined ? DEFAULT_SET[kind] : parseEarSet(kind, attrs.set, problems);
			const dir = (attrs.dir ?? 'asc') as EarDir;
			if (!EAR_DIRS.includes(dir)) problems.push(`ear dir must be ${EAR_DIRS.join(', ')}`);
			if (attrs.dir !== undefined && kind !== 'intervals')
				problems.push('dir= goes with kind="intervals"');
			const n = attrs.n === undefined ? 10 : Number(attrs.n);
			if (!/^\d+$/.test(attrs.n ?? '10') || n < 3 || n > 30)
				problems.push('ear n must be 3-30 questions');
			const key = attrs.key;
			if (key !== undefined && kind !== 'progressions')
				problems.push('key= goes with kind="progressions"');
			if (
				key !== undefined &&
				key !== 'random' &&
				!(PROGRESSION_KEYS as readonly string[]).includes(key)
			)
				problems.push(`ear key must be random or ${PROGRESSION_KEYS.join(', ')}`);
			if (problems.length) return null;
			return { t: 'ear', kind, set, dir, n, ...(key && { key }) };
		}
		case 'song': {
			const shape = { required: ['id'], optional: ['tempo'], label: 'optional' as const };
			if (!expectShape(name, attrs, label, problems, shape)) return null;
			if (!SLUG.test(attrs.id)) problems.push(`song id "${attrs.id}" must be kebab-case`);
			const tempo = attrs.tempo === undefined ? undefined : Number(attrs.tempo);
			if (tempo !== undefined && !(/^\d+$/.test(attrs.tempo) && tempo >= 25 && tempo <= 150))
				problems.push('song tempo must be 25-150 (% of the score tempo)');
			if (problems.length) return null;
			return {
				t: 'song',
				id: attrs.id,
				...(tempo !== undefined && { tempo }),
				...(label?.trim() && { label: label.trim() })
			};
		}
		case 'tip':
		case 'warning':
			if (!expectShape(name, attrs, label, problems, { label: 'required' })) return null;
			return {
				t: 'callout',
				kind: name,
				blocks: [{ t: 'p', c: parseInline(label!.trim(), problems) }]
			};
		default:
			problems.push(`unknown directive "::${name}" (use ${DIRECTIVE_NAMES.join(', ')})`);
			return null;
	}
}

// ---- blocks ------------------------------------------------------------------------------------

const LEAF = /^::([a-zA-Z][\w-]*)(?:\[([^\]]*)\])?(?:\{(.*)\})?\s*$/;
const CONTAINER_OPEN = /^:::([a-zA-Z][\w-]*)\s*$/;
const CONTAINER_CLOSE = /^:::\s*$/;
const FENCE = /^```\s*([\w-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^[-*+]\s+(.*)$/;
/** "1. text": a small number, then a space (so "2024. was a good year" stays a paragraph). */
const ORDERED = /^(\d{1,2})[.)]\s+(\S.*)$/;
/** Constructs outside the subset, rejected with a hint instead of rendering as plain text. */
const UNSUPPORTED: [RegExp, string][] = [
	[/^````/, 'only ``` fences are supported (no 4-backtick fences)'],
	[/^~~~/, 'use ```atex fences (~~~ fences are not supported)'],
	[/^>/, 'block quotes (">") are not supported: use :::tip or ::tip[...]'],
	[
		/^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$/,
		'horizontal rules ("---") are not supported: use a ## heading'
	],
	[/^\|/, 'tables are not supported: use a list']
];

/**
 * Compiles a lesson body. `firstLine` is the file line of the body's first line (for messages).
 * Problems are syntax and reference errors that make the lesson invalid.
 */
export function parseLesson(body: string, firstLine = 1): { blocks: Block[]; problems: Problem[] } {
	const lines = stripBom(body).replace(/\r\n?/g, '\n').split('\n');
	const problems: Problem[] = [];
	const root: Block[] = [];
	let target = root; // where blocks go: the root, or an open :::callout
	let container: { line: number } | null = null;
	let para: string[] = [];
	let paraLine = 0;
	let list: { ordered: boolean; items: string[]; line: number } | null = null;

	const report = (line: number, messages: string[]) => {
		for (const message of messages) problems.push({ line: firstLine + line, message });
	};
	const inline = (src: string, line: number) => {
		const found: string[] = [];
		const out = parseInline(src, found);
		report(line, found);
		return out;
	};
	const flush = () => {
		if (para.length) target.push({ t: 'p', c: inline(para.join(' '), paraLine) });
		if (list)
			target.push({
				t: 'list',
				ordered: list.ordered,
				items: list.items.map((item) => inline(item, list!.line))
			});
		para = [];
		list = null;
	};

	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i];
		const line = raw.trim();
		let m: RegExpExecArray | null;

		if (!line) {
			flush();
			continue;
		}
		const unsupported = UNSUPPORTED.find(([re]) => re.test(line));
		if (unsupported) {
			flush();
			report(i, [unsupported[1]]);
			if (/^(````|~~~)/.test(line)) {
				// Skip the fenced block so its contents are not reported line by line.
				const fence = line.startsWith('~') ? /^~~~/ : /^````/;
				while (++i < lines.length && !fence.test(lines[i].trim()));
			}
			continue;
		}
		const indented = /^\s/.test(raw);
		if (indented && (BULLET.test(line) || ORDERED.test(line))) {
			flush();
			report(i, [
				'nested or indented lists are not supported: keep lists flat, starting at column 1'
			]);
			continue;
		}
		if (list && indented && line.startsWith('::')) {
			flush();
			report(i, ['directives cannot go inside a list: leave a blank line and start at column 1']);
			continue;
		}
		if ((m = FENCE.exec(line))) {
			flush();
			const lang = m[1];
			const start = i;
			const code: string[] = [];
			while (++i < lines.length && !/^```\s*$/.test(lines[i].trim())) code.push(lines[i]);
			if (i >= lines.length) report(start, ['code fence is never closed']);
			else if (lang !== 'atex')
				report(start, [`code fences must be \`\`\`atex (got "${lang || 'none'}")`]);
			else if (!code.join('').trim()) report(start, ['empty atex block']);
			else target.push({ t: 'atex', tex: code.join('\n').trim() });
			continue;
		}
		if (CONTAINER_CLOSE.test(line)) {
			flush();
			if (!container) report(i, ['":::" closes nothing']);
			target = root;
			container = null;
			continue;
		}
		if ((m = CONTAINER_OPEN.exec(line))) {
			flush();
			const kind = m[1];
			if (container) report(i, ['callouts cannot be nested (close the previous one with ":::")']);
			if (kind !== 'tip' && kind !== 'warning') {
				report(i, [`unknown container ":::${kind}" (use :::tip or :::warning)`]);
				continue;
			}
			const block: Block = { t: 'callout', kind, blocks: [] };
			root.push(block);
			target = block.blocks;
			container = { line: i };
			continue;
		}
		if (line.startsWith('::')) {
			flush();
			m = LEAF.exec(line);
			if (!m) {
				report(i, [
					/^::[\w-]+\[[^\]]*\[/.test(line)
						? `a directive [label] cannot contain brackets (no links or [ ] inside): ${line}`
						: `malformed directive: ${line}`
				]);
				continue;
			}
			const attrs = m[3] === undefined ? {} : parseAttrs(m[3]);
			if (!attrs) {
				report(i, [`malformed attributes in ${line} (use key="value" pairs)`]);
				continue;
			}
			const found: string[] = [];
			const block = leafDirective(m[1], m[2], attrs, found);
			report(i, found);
			if (block) target.push(block);
			continue;
		}
		if ((m = HEADING.exec(line))) {
			flush();
			const level = m[1].length;
			if (level === 1) report(i, ['"#" is the lesson title: use "##" or "###" for headings']);
			else if (level > 3) report(i, ['only "##" and "###" headings are supported']);
			else target.push({ t: 'h', level: level as 2 | 3, c: inline(m[2], i) });
			continue;
		}
		if (line.startsWith('<')) {
			report(i, ['raw HTML is not allowed in lessons']);
			continue;
		}
		const bullet = BULLET.exec(line);
		let ordered = ORDERED.exec(line);
		// Inside a paragraph, only "1." starts a list ("12. May" can be a wrapped sentence).
		if (ordered && para.length && Number(ordered[1]) !== 1) ordered = null;
		if (bullet || ordered) {
			const isOrdered = !bullet;
			const text = bullet ? bullet[1] : ordered![2];
			if (text.trim().startsWith('::')) {
				flush();
				report(i, ['directives cannot go inside a list: leave a blank line and start at column 1']);
				continue;
			}
			if (para.length || (list && list.ordered !== isOrdered)) flush();
			list ??= { ordered: isOrdered, items: [], line: i };
			list.items.push(text);
			continue;
		}
		if (list && /^\s+/.test(raw)) {
			// Indented continuation of the last list item.
			list.items[list.items.length - 1] += ' ' + line;
			continue;
		}
		if (list) flush();
		if (!para.length) paraLine = i;
		para.push(line);
	}
	flush();
	if (container) report(container.line, ['callout is never closed with ":::"']);
	for (const block of root)
		if (block.t === 'callout' && !block.blocks.length)
			problems.push({
				line: firstLine,
				message: `empty :::${block.kind} callout`
			});
	return { blocks: root, problems };
}

/** Every block, callout contents included. */
export function* walkBlocks(blocks: Block[]): Generator<Block> {
	for (const b of blocks) {
		yield b;
		if (b.t === 'callout') yield* walkBlocks(b.blocks);
	}
}
