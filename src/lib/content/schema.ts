import { z } from 'zod';
import type { Sheet } from '../sheet/chordpro.ts';
import { EAR_KINDS } from '../ear/items.ts';
import { QUIZ_RE } from '../fretboard/quiz.ts';

export const STYLES = [
	'folk',
	'shanty',
	'spiritual',
	'blues',
	'carol',
	'children',
	'country',
	'ballad',
	'classical',
	'strumming',
	'fingerstyle'
] as const;
export const PLAYS = ['melody', 'chords', 'fingerstyle'] as const;
/** Licences an imported score may carry (the source's own: CC BY-SA stays CC BY-SA). */
export const IMPORT_LICENSE_RE = /^(Public Domain|CC0 1\.0|CC BY(-SA)? [234]\.[05])\b/;
/** The arranger named on every auto-fingered import. */
export const AUTO_ARRANGER = 'Self-Guitar (auto-fingered)';

export const songMetaSchema = z.strictObject({
	id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id must be kebab-case'),
	title: z.string().min(1),
	composer: z.string().min(1),
	arranger: z.string().min(1),
	level: z.number().int().min(0).max(9),
	style: z.enum(STYLES),
	key: z.string().min(1),
	source: z.string().min(1),
	/** Where the source text or score can be seen (an imported file's page, a printed edition). */
	sourceUrl: z.url({ protocol: /^https?$/ }).optional(),
	license: z.string().min(1),
	attribution: z.string().min(1),
	/** How it is played (the session's song block says so): picked melody, strummed chords, fingerpicked. */
	play: z.enum(PLAYS),
	/** Imported scores (scripts/import): the file it was converted from, for re-runs and review. */
	import: z
		.strictObject({
			via: z.enum(['mutopia', 'pdmx', 'musicxml', 'midi']),
			file: z.string().min(1),
			sha256: z.string().regex(/^[0-9a-f]{64}$/),
			/** Year the composer died (public-domain check: at least 71 years ago). */
			composerDied: z.number().int().min(1000).max(2100).optional()
		})
		.optional()
});

export type SongMeta = z.infer<typeof songMetaSchema>;
export type Style = (typeof STYLES)[number];
/** A tab (score.atex), a chord sheet (song.cho: lyrics, chords, generated strumming), or both. */
export type SongKind = 'tab' | 'sheet';
/**
 * As served by the API: meta + the score that plays by default (score.atex, or the sheet's
 * generated accompaniment when there is no score.atex) with its bar count and pickup flag, and the
 * compiled chord sheet when there is a song.cho (the sheet view regenerates its accompaniment, so
 * it can transpose).
 */
export type Song = SongMeta & {
	kind: SongKind;
	/** The song has a hand-written or imported tab (score.atex). */
	hasTab: boolean;
	tex: string;
	bars: number;
	pickup: boolean;
	sheet?: Sheet;
};
/** Where a song comes from and its license (the attributions page; not in the song list). */
export type SongCredit = Pick<
	SongMeta,
	'id' | 'title' | 'composer' | 'arranger' | 'source' | 'sourceUrl' | 'license' | 'attribution'
>;
export type SongSummary = Omit<
	Song,
	'tex' | 'sheet' | 'import' | 'source' | 'sourceUrl' | 'license' | 'attribution'
> & {
	/** Sheet songs: the chords used (for search and the list row). */
	chords?: string[];
};

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
	z.strictObject({ type: z.literal('tuner') }),
	z.strictObject({
		type: z.literal('ear'),
		kind: z.enum(EAR_KINDS),
		set: z.array(z.string().min(1)).min(1).max(12),
		accuracy: z.number().int().min(50).max(100).default(80),
		min: z.number().int().min(5).max(100).default(20)
	}),
	z.strictObject({
		type: z.literal('fretboard'),
		quiz: z.string().regex(QUIZ_RE, 'quiz must be string-1…string-6, strings-6-5, all or note-X'),
		target: z.number().int().min(5).max(600)
	})
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
		/** "What to play": 1–3 short plain-language steps shown above the tab. */
		howTo: z.array(z.string().min(3).max(140)).min(1).max(3),
		/** Chords used, in order of appearance (chord ids or names from content/chords.ts; "F@1-3-3-2-1-1" picks a voicing). */
		chords: z.array(z.string().min(1)).max(8).optional(),
		/** Strum pattern in ::strum syntax: 8th-note slots ("D - D - D - D -", "D - D U - U D U") or 16ths one beat per token ("D-DU DUDU D-DU DUDU"), for strummed exercises. */
		strum: z.string().max(40).optional(),
		startBpm: bpm,
		targetBpm: bpm,
		step: z.number().int().min(1).max(20).default(4),
		cleanReps: z.number().int().min(1).max(10).default(3),
		/** Note checking with the Mic button: on by default when no two notes start together; true/false overrides. */
		listen: z.boolean().optional()
	})
	.refine((e) => e.startBpm < e.targetBpm, { message: 'startBpm must be below targetBpm' });

// ---- warm-ups --------------------------------------------------------------------------------------

/** What a warm-up routine trains (the Library groups warm-ups by it). */
export const WARMUP_GOALS = [
	'stretch',
	'independence',
	'chromatic',
	'changes',
	'strumming',
	'fingerpicking',
	'legato',
	'muting',
	'pentatonic'
] as const;
export type WarmupGoal = (typeof WARMUP_GOALS)[number];

const stepText = z.string().min(3).max(120);
const stepSeconds = z.number().int().min(10).max(300);

/**
 * One step of a routine: an exercise's tempo ladder, an inline tab (alphaTex with \tempo), a strum
 * pattern with its click, or a timed stretch. `seconds` is the step's share of the routine
 * (default: an even share of what the other steps leave).
 */
export const warmupStepSchema = z.union([
	z.strictObject({ exercise: slug, text: stepText.optional(), seconds: stepSeconds.optional() }),
	z.strictObject({
		atex: z.string().min(1),
		text: stepText.optional(),
		/** Chords shown as diagrams: names, or "Name@voicing-id" ("G@3-2-0-0-3-3"). */
		chords: z.array(z.string().min(1)).max(6).optional(),
		/** The pattern the tab strums (8th-note slots, or 16ths one beat per token): shown as a strum row under it. */
		strum: z.string().max(40).optional(),
		seconds: stepSeconds.optional()
	}),
	z.strictObject({
		strum: z.string().max(40),
		bpm: z.number().int().min(40).max(200),
		chord: z.string().min(1).optional(),
		text: stepText.optional(),
		seconds: stepSeconds.optional()
	}),
	z.strictObject({ timer: z.number().int().min(5).max(300), text: stepText })
]);

/** content/warmups/<id>/meta.json: a 2–5 minute routine of steps. */
export const warmupMetaSchema = z
	.strictObject({
		id: slug,
		title: z.string().min(3).max(60),
		goal: z.enum(WARMUP_GOALS),
		level: z.number().int().min(0).max(9),
		minutes: z.number().int().min(2).max(5),
		/** 1–3 short steps (≤ 30 words in all), as for exercises. */
		howTo: z.array(z.string().min(3).max(140)).min(1).max(3),
		steps: z.array(warmupStepSchema).min(1).max(8),
		/** Tempo of the tab steps: where to start and the goal (both or neither). */
		startBpm: bpm.optional(),
		targetBpm: bpm.optional(),
		tags: z.array(slug).max(6).default([])
	})
	.refine((w) => (w.startBpm === undefined) === (w.targetBpm === undefined), {
		message: 'give both startBpm and targetBpm, or neither'
	})
	.refine((w) => w.startBpm === undefined || w.startBpm < w.targetBpm!, {
		message: 'startBpm must be below targetBpm'
	});

export type WarmupStep = z.infer<typeof warmupStepSchema>;
export type Warmup = z.infer<typeof warmupMetaSchema>;
