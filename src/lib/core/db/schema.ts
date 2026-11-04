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

// ---- Today: sessions, goals (M4) ----------------------------------------------------------------

/**
 * One guided practice session. The id is made by the client (a UUID) so a session started
 * offline can be synced later without duplicates. `date` is the learner's local day (YYYY-MM-DD);
 * `plan_json` is the plan as started (blocks with their targets and reasons).
 */
export const practiceSession = sqliteTable(
	'practice_session',
	{
		id: text('id').primaryKey(),
		profileId: integer('profile_id')
			.notNull()
			.references(() => profile.id, { onDelete: 'cascade' }),
		date: text('date').notNull(),
		plannedMin: integer('planned_min').notNull(),
		/** Whole minutes actually practised (sum of the blocks' time), set as blocks complete. */
		actualMin: integer('actual_min').notNull().default(0),
		startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
		endedAt: integer('ended_at', { mode: 'timestamp' }),
		planJson: text('plan_json').notNull()
	},
	(t) => [index('practice_session_date_idx').on(t.profileId, t.date)]
);

/** A block of a session: created with the session, updated when it is done or skipped. */
export const sessionBlock = sqliteTable(
	'session_block',
	{
		sessionId: text('session_id')
			.notNull()
			.references(() => practiceSession.id, { onDelete: 'cascade' }),
		idx: integer('idx').notNull(),
		kind: text('kind', { enum: ['warmup', 'technique', 'new', 'review', 'song'] }).notNull(),
		targetJson: text('target_json').notNull(),
		plannedMin: integer('planned_min').notNull(),
		actualSec: integer('actual_sec').notNull().default(0),
		/** Self-rating after the block: hard 😖 · ok 🙂 · great 😎. */
		rating: text('rating', { enum: ['hard', 'ok', 'great'] }),
		/** Optional "clean at BPM ___". */
		bpm: integer('bpm'),
		completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
		skipped: integer('skipped', { mode: 'boolean' }).notNull().default(false)
	},
	(t) => [primaryKey({ columns: [t.sessionId, t.idx] })]
);

/** Weekly goal and default session length (one row per profile; defaults when missing). */
export const profileSettings = sqliteTable('profile_settings', {
	profileId: integer('profile_id')
		.primaryKey()
		.references(() => profile.id, { onDelete: 'cascade' }),
	weeklyDays: integer('weekly_days').notNull().default(5),
	dailyMin: integer('daily_min').notNull().default(15),
	sessionMin: integer('session_min').notNull().default(15)
});

// ---- ear trainer and fretboard quiz (M6) ----------------------------------------------------------

/**
 * One ear-training answer: the item played (an interval "P5", a chord type "m7", a numeral "IV",
 * a note "A") and the answer given. `correct` is item = answer, stored for cheap counts.
 */
export const earResult = sqliteTable(
	'ear_result',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		profileId: integer('profile_id')
			.notNull()
			.references(() => profile.id, { onDelete: 'cascade' }),
		kind: text('kind', { enum: ['intervals', 'chords', 'progressions', 'playback'] }).notNull(),
		item: text('item').notNull(),
		answer: text('answer').notNull(),
		correct: integer('correct', { mode: 'boolean' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [index('ear_result_idx').on(t.profileId, t.kind)]
);

/** One round of a fretboard "find the note" quiz: notes found, wrong taps, time taken. */
export const fretboardResult = sqliteTable(
	'fretboard_result',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		profileId: integer('profile_id')
			.notNull()
			.references(() => profile.id, { onDelete: 'cascade' }),
		quiz: text('quiz').notNull(),
		found: integer('found').notNull(),
		wrong: integer('wrong').notNull(),
		ms: integer('ms').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [index('fretboard_result_idx').on(t.profileId, t.quiz)]
);
