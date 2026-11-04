// Node-only: loads content/warmups/<id>/meta.json (one routine each) and checks every step
// against the rest of the content: exercises exist, inline tabs parse and add up, strum patterns
// and chords are valid, the step times fit the routine.
import fs from 'node:fs';
import path from 'node:path';
import { chordRefProblem } from '../chords/index.ts';
import { TEMPO_RE } from '../learn/ladder.ts';
import { parseStrum } from '../learn/strum.ts';
import type { Exercise } from '../learn/types.ts';
import { checkAlphaTex, strumMeterMismatch, strumMismatches } from './alphatex.ts';
import { readMeta } from './load.ts';
import { stepSeconds } from '../warmups/steps.ts';
import { warmupMetaSchema, type Warmup } from './schema.ts';

/** Words in howTo steps (tokens with a letter or a digit). */
const words = (steps: string[]) =>
	steps
		.join(' ')
		.split(/\s+/)
		.filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

export function loadWarmups(
	contentDir: string,
	exercises: Exercise[],
	howToMax: number
): { warmups: Warmup[]; errors: string[] } {
	const dir = path.join(contentDir, 'warmups');
	const errors: string[] = [];
	const warmups: Warmup[] = [];
	const ids = fs.existsSync(dir)
		? fs
				.readdirSync(dir, { withFileTypes: true })
				.filter((d) => d.isDirectory())
				.map((d) => d.name)
				.sort()
		: [];
	const exIds = new Set(exercises.map((e) => e.id));
	for (const id of ids) {
		const where = `warmups/${id}`;
		const extra = fs.readdirSync(path.join(dir, id)).filter((f) => f !== 'meta.json');
		if (extra.length)
			errors.push(`${where}: only meta.json belongs here (found ${extra.join(', ')})`);
		const w = readMeta(path.join(dir, id), where, warmupMetaSchema, errors);
		if (!w) continue;
		const err = (m: string) => errors.push(`${where}/meta.json: ${m}`);
		const n = words(w.howTo);
		if (n > howToMax) err(`howTo has ${n} words; keep it to ${howToMax} in total`);
		w.steps.forEach((s, i) => {
			const at = `steps[${i}]`;
			if ('exercise' in s) {
				if (!exIds.has(s.exercise)) err(`${at}: unknown exercise "${s.exercise}"`);
			} else if ('atex' in s) {
				if (!TEMPO_RE.test(s.atex)) err(`${at}: the tab needs a \\tempo`);
				if (w.startBpm === undefined)
					err(`${at}: a tab step needs the routine's startBpm/targetBpm`);
				for (const p of checkAlphaTex(s.atex)) err(`${at}: tab: ${p}`);
				for (const c of s.chords ?? []) {
					const problem = chordRefProblem(c);
					if (problem) err(`${at}: ${problem}`);
				}
				if (s.strum !== undefined) {
					const p = parseStrum(s.strum);
					const meter = 'error' in p ? null : strumMeterMismatch(s.atex, p);
					if ('error' in p) err(`${at}: strum: ${p.error}`);
					else if (meter) err(`${at}: strum: ${meter}`);
					else {
						const bars = strumMismatches(s.atex, p);
						if (bars.length) err(`${at}: bar ${bars.join(', ')} does not strum "${s.strum}"`);
					}
				}
			} else if ('strum' in s) {
				const p = parseStrum(s.strum);
				if ('error' in p) err(`${at}: strum: ${p.error}`);
				const problem = s.chord ? chordRefProblem(s.chord) : null;
				if (problem) err(`${at}: ${problem}`);
			}
		});
		const total = stepSeconds(w).reduce((a, b) => a + b, 0);
		if (total > w.minutes * 60 + 30)
			err(
				`steps take ${total} s; the routine is ${w.minutes} minutes (lower seconds/timer or raise minutes)`
			);
		warmups.push(w);
	}
	return { warmups, errors };
}
