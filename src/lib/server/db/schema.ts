import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const profile = sqliteTable('profile', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`)
});

export const songProgress = sqliteTable(
	'song_progress',
	{
		profileId: integer('profile_id')
			.notNull()
			.references(() => profile.id, { onDelete: 'cascade' }),
		songId: text('song_id').notNull(),
		lastTempoPct: integer('last_tempo_pct').notNull().default(100),
		maxPlayedTempoPct: integer('max_played_tempo_pct'),
		lastPlayedAt: integer('last_played_at', { mode: 'timestamp' }),
		loopStartBar: integer('loop_start_bar'),
		loopEndBar: integer('loop_end_bar')
	},
	(t) => [primaryKey({ columns: [t.profileId, t.songId] })]
);

/** One "1-minute changes" result. The pair is stored in canonical order (chordA < chordB). */
export const chordChangeRecord = sqliteTable(
	'chord_change_record',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		profileId: integer('profile_id')
			.notNull()
			.references(() => profile.id, { onDelete: 'cascade' }),
		chordA: text('chord_a').notNull(),
		chordB: text('chord_b').notNull(),
		count: integer('count').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [index('chord_change_pair_idx').on(t.profileId, t.chordA, t.chordB)]
);

// ---- curriculum (M3) ---------------------------------------------------------------------------

/**
 * A lesson opened (started) or marked complete. Never goes back from completed. `updated_at` is
 * when it was last opened or completed (the next-lesson pick prefers the latest started lesson).
 */
export const lessonProgress = sqliteTable(
	'lesson_progress',
	{
		profileId: integer('profile_id')
			.notNull()
			.references(() => profile.id, { onDelete: 'cascade' }),
		lessonId: text('lesson_id').notNull(),
		status: text('status', { enum: ['started', 'completed'] }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		completedAt: integer('completed_at', { mode: 'timestamp' })
	},
	(t) => [primaryKey({ columns: [t.profileId, t.lessonId] })]
);

/**
 * One tempo-ladder pass of an exercise, rated clean or missed. `ladder_bpm` is the ladder's tempo
 * after this rating (where the next session resumes); `mastered` marks the pass that completed
 * `cleanReps` clean passes in a row at the target tempo.
 */
export const exerciseAttempt = sqliteTable(
	'exercise_attempt',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		profileId: integer('profile_id')
			.notNull()
			.references(() => profile.id, { onDelete: 'cascade' }),
		exerciseId: text('exercise_id').notNull(),
		bpm: integer('bpm').notNull(),
		clean: integer('clean', { mode: 'boolean' }).notNull(),
		ladderBpm: integer('ladder_bpm').notNull(),
		mastered: integer('mastered', { mode: 'boolean' }).notNull().default(false),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [index('exercise_attempt_idx').on(t.profileId, t.exerciseId)]
);

/** A confirmed self-assessed mastery check (self checklist or tuner). */
export const masteryRecord = sqliteTable(
	'mastery_record',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		profileId: integer('profile_id')
			.notNull()
			.references(() => profile.id, { onDelete: 'cascade' }),
		lessonId: text('lesson_id').notNull(),
		value: text('value').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [index('mastery_record_idx').on(t.profileId, t.lessonId)]
);

/**
 * Derived per-skill status, synced by every progress write. `due_at` and `ease` belong to the M4
 * review scheduler: while `due_at` is set, the sync leaves the row alone.
 */
export const skillState = sqliteTable(
	'skill_state',
	{
		profileId: integer('profile_id')
			.notNull()
			.references(() => profile.id, { onDelete: 'cascade' }),
		skillId: text('skill_id').notNull(),
		status: text('status', { enum: ['new', 'learning', 'mastered'] }).notNull(),
		masteredAt: integer('mastered_at', { mode: 'timestamp' }),
		dueAt: integer('due_at', { mode: 'timestamp' }),
		ease: real('ease')
	},
	(t) => [primaryKey({ columns: [t.profileId, t.skillId] })]
);
