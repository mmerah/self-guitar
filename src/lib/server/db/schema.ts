import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
