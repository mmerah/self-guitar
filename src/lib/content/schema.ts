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

// ---- curriculum ----------------------------------------------------------------------------------

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be a kebab-case slug');
const bpm = z.number().int().min(30).max(250);

export const masterySchema = z.discriminatedUnion('type', [
	z.strictObject({
		type: z.literal('changes'),
		a: z.string().min(1),
		b: z.string().min(1),
		target: z.number().int().min(1).max(300)
	}),
	z.strictObject({ type: z.literal('exercise'), id: slug, bpm }),
	z.strictObject({
		type: z.literal('self'),
		items: z.array(z.string().min(3)).min(1).max(8)
	}),
	z.strictObject({ type: z.literal('tuner') })
]);

/** Lesson front-matter (content/lessons/L<level>/<id>.md). */
export const lessonFrontMatterSchema = z.strictObject({
	id: slug,
	title: z.string().min(3).max(60),
	level: z.number().int().min(0).max(9),
	unit: slug,
	skills: z.array(slug).min(1),
	prereqs: z.array(slug).default([]),
	minutes: z.number().int().min(1).max(60),
	order: z.number().int().min(0).max(999).default(0),
	mastery: masterySchema.optional()
});

/** Exercise meta.json (content/exercises/<id>/). */
export const exerciseMetaSchema = z
	.strictObject({
		id: slug,
		title: z.string().min(3).max(60),
		skills: z.array(slug).min(1),
		startBpm: bpm,
		targetBpm: bpm,
		step: z.number().int().min(1).max(20).default(4),
		cleanReps: z.number().int().min(1).max(10).default(3)
	})
	.refine((e) => e.startBpm < e.targetBpm, { message: 'startBpm must be below targetBpm' });
