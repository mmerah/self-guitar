// Node-only: reads content/<kind>/<id>/{meta.json,<body file>}. Used by build scripts and tests.
// Each folder-per-item kind (songs, exercises) is one entry in KINDS; lessons are single .md files
// (see learn.ts).
import fs from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';
import { exerciseMetaSchema, songMetaSchema, type Song } from './schema.ts';

type Kind = { schema: z.ZodType<{ id: string }>; body: string };

export const KINDS = {
	songs: { schema: songMetaSchema, body: 'score.atex' },
	exercises: { schema: exerciseMetaSchema, body: 'score.atex' }
} satisfies Record<string, Kind>;

export type LoadResult<T> = { items: T[]; errors: string[] };

/** Loads every `<kind>/<id>/` folder: validated meta.json plus the raw body text. */
export function loadKind<K extends keyof typeof KINDS>(contentDir: string, kind: K) {
	const { schema, body } = KINDS[kind] as { schema: (typeof KINDS)[K]['schema']; body: string };
	const kindDir = path.join(contentDir, kind);
	type Meta = z.infer<(typeof KINDS)[K]['schema']>;
	const items: (Meta & { body: string })[] = [];
	const errors: string[] = [];
	const dirs = fs.existsSync(kindDir)
		? fs
				.readdirSync(kindDir, { withFileTypes: true })
				.filter((d) => d.isDirectory())
				.map((d) => d.name)
				.sort()
		: [];

	for (const dir of dirs) {
		const where = `${kind}/${dir}`;
		const metaPath = path.join(kindDir, dir, 'meta.json');
		const bodyPath = path.join(kindDir, dir, body);
		if (!fs.existsSync(metaPath) || !fs.existsSync(bodyPath)) {
			errors.push(`${where}: meta.json and ${body} are both required`);
			continue;
		}
		let raw: unknown;
		try {
			raw = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
		} catch (e) {
			errors.push(`${where}/meta.json: invalid JSON (${(e as Error).message})`);
			continue;
		}
		const parsed = schema.safeParse(raw);
		if (!parsed.success) {
			for (const issue of parsed.error.issues) {
				errors.push(`${where}/meta.json: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
			}
			continue;
		}
		if (parsed.data.id !== dir) {
			errors.push(`${where}/meta.json: id "${parsed.data.id}" must match folder name`);
			continue;
		}
		items.push({ ...(parsed.data as Meta), body: fs.readFileSync(bodyPath, 'utf8') });
	}
	return { items, errors };
}

/** Songs with their alphaTex (`bars`/`pickup` are filled in by content-build). */
export function loadSongs(contentDir: string): { songs: Song[]; errors: string[] } {
	const { items, errors } = loadKind(contentDir, 'songs');
	return {
		songs: items.map(({ body, ...meta }) => ({ ...meta, tex: body, bars: 0, pickup: false })),
		errors
	};
}
