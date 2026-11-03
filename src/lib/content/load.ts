// Node-only: reads content/<kind>/<id>/{meta.json,<body file>}. Used by build scripts and tests.
// Exercises are one entry in KINDS; songs (score.atex and/or song.cho) and warm-ups (meta.json
// only) have loaders of their own; lessons are single .md files (see learn.ts).
import fs from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';
import { accompaniment } from '../sheet/accompany.ts';
import { parseChordPro, type Sheet } from '../sheet/chordpro.ts';
import { exerciseMetaSchema, songMetaSchema, type Song, type SongMeta } from './schema.ts';

type Kind = { schema: z.ZodType<{ id: string }>; body: string };

export const KINDS = {
	exercises: { schema: exerciseMetaSchema, body: 'score.atex' }
} satisfies Record<string, Kind>;

export type LoadResult<T> = { items: T[]; errors: string[] };

/** Folder names under content/<kind>/ (sorted). */
function folders(kindDir: string) {
	return fs.existsSync(kindDir)
		? fs
				.readdirSync(kindDir, { withFileTypes: true })
				.filter((d) => d.isDirectory())
				.map((d) => d.name)
				.sort()
		: [];
}

/** meta.json of one folder, validated against `schema` (problems go to `errors`). */
export function readMeta<S extends z.ZodType<{ id: string }>>(
	dir: string,
	where: string,
	schema: S,
	errors: string[]
): z.infer<S> | null {
	const metaPath = path.join(dir, 'meta.json');
	if (!fs.existsSync(metaPath)) {
		errors.push(`${where}: meta.json is missing`);
		return null;
	}
	let raw: unknown;
	try {
		raw = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
	} catch (e) {
		errors.push(`${where}/meta.json: invalid JSON (${(e as Error).message})`);
		return null;
	}
	const parsed = schema.safeParse(raw);
	if (!parsed.success) {
		for (const issue of parsed.error.issues)
			errors.push(`${where}/meta.json: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
		return null;
	}
	if (parsed.data.id !== path.basename(dir)) {
		errors.push(`${where}/meta.json: id "${parsed.data.id}" must match folder name`);
		return null;
	}
	return parsed.data;
}

/** Loads every `<kind>/<id>/` folder: validated meta.json plus the raw body text. */
export function loadKind<K extends keyof typeof KINDS>(contentDir: string, kind: K) {
	const { schema, body } = KINDS[kind] as { schema: (typeof KINDS)[K]['schema']; body: string };
	const kindDir = path.join(contentDir, kind);
	type Meta = z.infer<(typeof KINDS)[K]['schema']>;
	const items: (Meta & { body: string })[] = [];
	const errors: string[] = [];
	for (const dir of folders(kindDir)) {
		const where = `${kind}/${dir}`;
		const bodyPath = path.join(kindDir, dir, body);
		if (!fs.existsSync(bodyPath)) {
			errors.push(`${where}: meta.json and ${body} are both required`);
			continue;
		}
		const meta = readMeta(path.join(kindDir, dir), where, schema, errors);
		if (meta) items.push({ ...(meta as Meta), body: fs.readFileSync(bodyPath, 'utf8') });
	}
	return { items, errors };
}

/** Files a song folder may hold (REVIEW.md is the import checklist: never compiled or shipped). */
const SONG_FILES = ['meta.json', 'score.atex', 'song.cho', 'REVIEW.md'];

/**
 * Songs: meta.json plus score.atex (a tab), song.cho (a chord sheet) or both. A sheet is compiled
 * and cross-checked with its meta, and its accompaniment generated (`bars`/`pickup` are filled in
 * by content-build). `warnings` are printed, never fatal.
 */
export function loadSongs(contentDir: string): {
	songs: Song[];
	errors: string[];
	warnings: string[];
} {
	const kindDir = path.join(contentDir, 'songs');
	const songs: Song[] = [];
	const errors: string[] = [];
	const warnings: string[] = [];
	for (const dir of folders(kindDir)) {
		const where = `songs/${dir}`;
		const folder = path.join(kindDir, dir);
		for (const f of fs.readdirSync(folder))
			if (!SONG_FILES.includes(f))
				errors.push(`${where}/${f}: unexpected file (allowed: ${SONG_FILES.join(', ')})`);
		const meta = readMeta(folder, where, songMetaSchema, errors);
		if (!meta) continue;
		const read = (f: string) =>
			fs.existsSync(path.join(folder, f)) ? fs.readFileSync(path.join(folder, f), 'utf8') : null;
		const tab = read('score.atex');
		const cho = read('song.cho');
		if (tab === null && cho === null) {
			errors.push(`${where}: needs score.atex (a tab) or song.cho (a chord sheet), or both`);
			continue;
		}
		let sheet: Sheet | undefined;
		if (cho !== null) {
			const r = parseChordPro(cho);
			errors.push(...r.errors.map((e) => `${where}/song.cho: ${e}`));
			warnings.push(...r.warnings.map((w) => `${where}/song.cho: ${w}`));
			if (!r.sheet) continue;
			sheet = r.sheet;
			const problems = sheetMetaProblems(sheet, meta, tab !== null);
			errors.push(...problems.map((p) => `${where}/song.cho: ${p}`));
			if (problems.length) continue;
		}
		songs.push({
			...meta,
			kind: sheet ? 'sheet' : 'tab',
			hasTab: tab !== null,
			tex: tab ?? accompaniment(sheet!),
			bars: 0,
			pickup: false,
			...(sheet && { sheet })
		});
	}
	return { songs, errors, warnings };
}

/** A sheet must agree with its meta.json: title, key (root and mode), level, how it is played. */
export function sheetMetaProblems(sheet: Sheet, meta: SongMeta, hasTab: boolean): string[] {
	const out: string[] = [];
	if (sheet.title !== meta.title)
		out.push(`{title: ${sheet.title}} differs from meta.json "${meta.title}"`);
	const root = /^[A-G][#b]?/.exec(sheet.key)![0];
	const metaRoot = /^([A-G][#b]?)/.exec(meta.key)?.[1];
	if (metaRoot !== root) out.push(`{key: ${sheet.key}} differs from meta.json key "${meta.key}"`);
	if (sheet.level !== null && sheet.level !== meta.level)
		out.push(`{x_level: ${sheet.level}} differs from meta.json level ${meta.level}`);
	if (!hasTab && meta.play !== 'chords')
		out.push('a chord sheet without a tab is played "chords" (meta.json play)');
	return out;
}
