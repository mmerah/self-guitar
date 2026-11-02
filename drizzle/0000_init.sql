CREATE TABLE `profile` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `song_progress` (
	`profile_id` integer NOT NULL,
	`song_id` text NOT NULL,
	`last_tempo_pct` integer DEFAULT 100 NOT NULL,
	`max_played_tempo_pct` integer,
	`last_played_at` integer,
	`loop_start_bar` integer,
	`loop_end_bar` integer,
	PRIMARY KEY(`profile_id`, `song_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE cascade
);
