// Node-only: compiles the curriculum (content/curriculum.ts), lessons (content/lessons/L<n>/*.md)
// and exercises (content/exercises/<id>/) into the LearnIndex, with every cross-reference checked.
// `errors` make content:check and content:build fail; `warnings` are printed only.
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { CURRICULUM } from '../../../content/curriculum.ts';
import { getChord } from '../chords/index.ts';
import { TEMPO_RE } from '../learn/ladder.ts';
import { parseStrum } from '../learn/strum.ts';
import { parseLesson, splitFrontMatter, walkBlocks } from '../learn/markdown.ts';
import type { Exercise, LearnIndex, Lesson, Level } from '../learn/types.ts';
import { checkAlphaTex, strumMismatches } from './alphatex.ts';
import { loadKind } from './load.ts';
import { lessonFrontMatterSchema } from './schema.ts';

/** Levels whose skills must all be taught by some lesson (later levels only warn). */
export const REQUIRED_COVERAGE_LEVELS = [0];
/** Levels with a full unit/skill structure whose missing lessons are reported as warnings. */
export const PLANNED_LEVELS = [1, 2, 3];

export type LearnResult = { index: LearnIndex; errors: string[]; warnings: string[] };

function checkCurriculum(levels: Level[], errors: string[]) {
	const seen = new Set<string>();
	const dup = (kind: string, id: string) => {
		if (seen.has(`${kind}:${id}`)) errors.push(`curriculum: duplicate ${kind} id "${id}"`);
		seen.add(`${kind}:${id}`);
	};
	levels.forEach((level, i) => {
		if (level.id !== i) errors.push(`curriculum: level ${level.id} is out of order`);
		for (const unit of level.units) {
			dup('unit', unit.id);
			if (!unit.skills.length) errors.push(`curriculum: unit ${unit.id} has no skills`);
			for (const skill of unit.skills) dup('skill', skill.id);
		}
	});
}

function readLessonFiles(dir: string): { file: string; level: number }[] {
	if (!fs.existsSync(dir)) return [];
	return fs
		.readdirSync(dir, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.flatMap((d) => {
			const level = /^L(\d)$/.exec(d.name);
			const files = fs.readdirSync(path.join(dir, d.name)).filter((f) => f.endsWith('.md'));
			return files.map((f) => ({ file: path.join(d.name, f), level: level ? +level[1] : -1 }));
		})
		.sort((a, b) => a.file.localeCompare(b.file));
}

/** Returns the lesson ids in a prerequisite cycle, or null. */
function findCycle(lessons: Lesson[]): string[] | null {
	const byId = new Map(lessons.map((l) => [l.id, l]));
	const state = new Map<string, 'visiting' | 'done'>();
	const stack: string[] = [];
	const visit = (id: string): string[] | null => {
		if (state.get(id) === 'done') return null;
		if (state.get(id) === 'visiting') return [...stack.slice(stack.indexOf(id)), id];
		state.set(id, 'visiting');
		stack.push(id);
		for (const p of byId.get(id)?.prereqs ?? []) {
			const cycle = visit(p);
			if (cycle) return cycle;
		}
		stack.pop();
		state.set(id, 'done');
		return null;
	};
	for (const l of lessons) {
		const cycle = visit(l.id);
		if (cycle) return cycle;
	}
	return null;
}

/** The "What to play" steps are read at a glance: at most this many words in all. */
export const HOWTO_MAX_WORDS = 30;
/** Words in howTo steps (tokens with a letter or a digit: "=" and "+" do not count). */
export const howToWords = (steps: string[]) =>
	steps
		.join(' ')
		.split(/\s+/)
		.filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
/** Chord names written over the score ({ch "G"}), comments left out. */
export const scoreChordLabels = (tex: string) => [
	...new Set([...tex.replace(/^\s*\/\/.*$/gm, '').matchAll(/\bch\s+"([^"]+)"/g)].map((m) => m[1]))
];

export function loadLearn(contentDir: string, levels: Level[] = CURRICULUM): LearnResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	checkCurriculum(levels, errors);

	const unitLevel = new Map<string, { level: number; index: number }>();
	const skillIds = new Set<string>();
	for (const level of levels)
		level.units.forEach((u, index) => {
			unitLevel.set(u.id, { level: level.id, index });
			for (const s of u.skills) skillIds.add(s.id);
		});

	// Exercises
	const loaded = loadKind(contentDir, 'exercises');
	errors.push(...loaded.errors);
	const exercises: Exercise[] = loaded.items.map(({ body, ...meta }) => ({ ...meta, tex: body }));
	const exerciseById = new Map(exercises.map((e) => [e.id, e]));
	for (const e of exercises) {
		for (const s of e.skills)
			if (!skillIds.has(s)) errors.push(`exercises/${e.id}: unknown skill "${s}"`);
		if (!TEMPO_RE.test(e.tex))
			errors.push(`exercises/${e.id}/score.atex: needs a \\tempo (the ladder scales it)`);
		for (const c of e.chords ?? [])
			if (!getChord(c)) errors.push(`exercises/${e.id}/meta.json: chords: unknown chord "${c}"`);
		if (e.strum !== undefined) {
			const parsed = parseStrum(e.strum);
			if ('error' in parsed) errors.push(`exercises/${e.id}/meta.json: strum: ${parsed.error}`);
			else {
				const bars = strumMismatches(e.tex, parsed.slots);
				if (bars.length)
					errors.push(
						`exercises/${e.id}/score.atex: bar ${bars.join(', ')} does not strum the pattern "${e.strum}" (the strum row would contradict the tab)`
					);
			}
		}
		const words = howToWords(e.howTo);
		if (words > HOWTO_MAX_WORDS)
			errors.push(
				`exercises/${e.id}/meta.json: howTo has ${words} words; keep it to ${HOWTO_MAX_WORDS} in total`
			);
		if (e.chords) {
			const labels = scoreChordLabels(e.tex).filter((c) => !e.chords!.includes(c));
			if (labels.length)
				errors.push(
					`exercises/${e.id}/meta.json: chords: the score names ${labels.join(', ')}; list ${labels.length > 1 ? 'them' : 'it'} too`
				);
		}
	}

	// Lessons
	const lessonsDir = path.join(contentDir, 'lessons');
	const lessons: Lesson[] = [];
	for (const { file, level } of readLessonFiles(lessonsDir)) {
		const where = `lessons/${file}`;
		if (level < 0) {
			errors.push(`${where}: lessons go in lessons/L<level>/ folders`);
			continue;
		}
		const src = fs.readFileSync(path.join(lessonsDir, file), 'utf8');
		const fm = splitFrontMatter(src);
		if (!fm) {
			errors.push(`${where}: missing front-matter (--- ... ---) at the top`);
			continue;
		}
		let raw: unknown;
		try {
			raw = parseYaml(fm.yaml);
		} catch (e) {
			errors.push(`${where}: front-matter is not valid YAML (${(e as Error).message})`);
			continue;
		}
		const parsed = lessonFrontMatterSchema.safeParse(raw);
		if (!parsed.success) {
			for (const issue of parsed.error.issues)
				errors.push(`${where}: front-matter ${issue.path.join('.') || '(root)'}: ${issue.message}`);
			continue;
		}
		const meta = parsed.data;
		const problems: string[] = [];
		if (meta.id !== path.basename(file, '.md'))
			problems.push(`id "${meta.id}" must match the file name`);
		if (meta.level !== level) problems.push(`level ${meta.level} but the file is in L${level}/`);
		const unit = unitLevel.get(meta.unit);
		if (!unit) problems.push(`unknown unit "${meta.unit}"`);
		else if (unit.level !== meta.level)
			problems.push(`unit "${meta.unit}" belongs to level ${unit.level}`);
		for (const s of meta.skills) if (!skillIds.has(s)) problems.push(`unknown skill "${s}"`);
		if (new Set(meta.skills).size !== meta.skills.length) problems.push('duplicate skills');
		if (meta.prereqs.includes(meta.id)) problems.push('a lesson cannot be its own prereq');

		const m = meta.mastery;
		if (m?.type === 'changes') {
			const a = getChord(m.a);
			const b = getChord(m.b);
			if (!a) problems.push(`mastery: unknown chord "${m.a}"`);
			if (!b) problems.push(`mastery: unknown chord "${m.b}"`);
			if (a && b && a.id === b.id) problems.push('mastery: changes needs two different chords');
		}
		if (m?.type === 'exercise') {
			const ex = exerciseById.get(m.id);
			if (!ex) problems.push(`mastery: unknown exercise "${m.id}"`);
			else if (m.bpm > ex.targetBpm || m.bpm < ex.startBpm)
				problems.push(
					`mastery: bpm ${m.bpm} is outside ${m.id}'s ladder (${ex.startBpm}-${ex.targetBpm})`
				);
		}

		const body = parseLesson(fm.body, fm.bodyLine);
		const at = (line: number) => `${where}:${line}`;
		for (const p of body.problems) errors.push(`${at(p.line)}: ${p.message}`);
		for (const block of walkBlocks(body.blocks)) {
			if (block.t === 'exercise' && !exerciseById.has(block.id))
				problems.push(`::exercise: unknown exercise "${block.id}"`);
		}
		if (!body.blocks.length) problems.push('lesson body is empty');
		if (body.blocks[0] && body.blocks[0].t !== 'p')
			warnings.push(`${where}: start with a short intro paragraph (shown in the skill tree)`);
		for (const p of problems) errors.push(`${where}: ${p}`);
		if (problems.length || body.problems.length) continue;
		lessons.push({ ...meta, blocks: body.blocks });
	}

	// Ids, prereqs, order
	const byId = new Map<string, Lesson>();
	for (const l of lessons) {
		if (byId.has(l.id)) errors.push(`lessons: duplicate lesson id "${l.id}"`);
		byId.set(l.id, l);
	}
	const rank = (l: Lesson) => [l.level, unitLevel.get(l.unit)?.index ?? 0, l.order] as const;
	lessons.sort((a, b) => {
		const [ra, rb] = [rank(a), rank(b)];
		return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2] || a.id.localeCompare(b.id);
	});
	const position = new Map(lessons.map((l, i) => [l.id, i]));
	for (const l of lessons) {
		for (const p of l.prereqs) {
			if (!byId.has(p)) errors.push(`lessons/L${l.level}/${l.id}.md: unknown prereq "${p}"`);
			else if (position.get(p)! > position.get(l.id)!)
				errors.push(
					`lessons/L${l.level}/${l.id}.md: prereq "${p}" comes later in the curriculum (fix unit or order)`
				);
		}
	}
	const cycle = findCycle(lessons);
	if (cycle) errors.push(`lessons: prereq cycle ${cycle.join(' -> ')}`);

	// Coverage: every skill is taught by a lesson; every exercise is used.
	const taught = new Set(lessons.flatMap((l) => l.skills));
	for (const level of levels) {
		const missing = level.units.flatMap((u) => u.skills).filter((s) => !taught.has(s.id));
		if (!missing.length) continue;
		const msg = `level ${level.id}: no lesson teaches ${missing.map((s) => s.id).join(', ')}`;
		if (REQUIRED_COVERAGE_LEVELS.includes(level.id)) errors.push(msg);
		else if (PLANNED_LEVELS.includes(level.id)) warnings.push(msg);
	}
	const used = new Set(
		lessons.flatMap((l) => [
			...[...walkBlocks(l.blocks)].flatMap((b) => (b.t === 'exercise' ? [b.id] : [])),
			...(l.mastery?.type === 'exercise' ? [l.mastery.id] : [])
		])
	);
	for (const e of exercises)
		if (!used.has(e.id)) warnings.push(`exercises/${e.id}: not used by any lesson`);

	return { index: { levels, lessons, exercises }, errors, warnings };
}

/** Slow checks (alphaTab parses every exercise score and inline atex block). */
export function checkLearnScores(index: LearnIndex): string[] {
	const errors: string[] = [];
	for (const e of index.exercises)
		for (const p of checkAlphaTex(e.tex)) errors.push(`exercises/${e.id}/score.atex: ${p}`);
	for (const l of index.lessons) {
		let n = 0;
		for (const b of walkBlocks(l.blocks)) {
			if (b.t !== 'atex') continue;
			n++;
			for (const p of checkAlphaTex(b.tex))
				errors.push(`lessons/L${l.level}/${l.id}.md: atex block ${n}: ${p}`);
		}
	}
	return errors;
}
