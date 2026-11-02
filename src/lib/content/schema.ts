import { z } from 'zod';

export const STYLES = ['folk', 'classical', 'blues', 'strumming'] as const;

export const songMetaSchema = z.strictObject({
	id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id must be kebab-case'),
	title: z.string().min(1),
	composer: z.string().min(1),
	arranger: z.string().min(1),
	level: z.number().int().min(0).max(9),
	style: z.enum(STYLES),
	key: z.string().min(1),
	source: z.string().min(1),
	license: z.string().min(1),
	attribution: z.string().min(1)
});

export type SongMeta = z.infer<typeof songMetaSchema>;
export type Style = (typeof STYLES)[number];
/** As served by the API: meta + alphaTex + bar count and pickup flag (computed at build time). */
export type Song = SongMeta & { tex: string; bars: number; pickup: boolean };
export type SongSummary = Omit<Song, 'tex'>;
