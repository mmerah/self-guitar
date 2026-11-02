import { sql } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
