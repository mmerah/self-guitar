CREATE TABLE `practice_session` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` integer NOT NULL,
	`date` text NOT NULL,
	`planned_min` integer NOT NULL,
	`actual_min` integer DEFAULT 0 NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`plan_json` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `practice_session_date_idx` ON `practice_session` (`profile_id`,`date`);--> statement-breakpoint
CREATE TABLE `profile_settings` (
	`profile_id` integer PRIMARY KEY NOT NULL,
	`weekly_days` integer DEFAULT 5 NOT NULL,
	`daily_min` integer DEFAULT 15 NOT NULL,
	`session_min` integer DEFAULT 15 NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session_block` (
	`session_id` text NOT NULL,
	`idx` integer NOT NULL,
	`kind` text NOT NULL,
	`target_json` text NOT NULL,
	`planned_min` integer NOT NULL,
	`actual_sec` integer DEFAULT 0 NOT NULL,
	`rating` text,
	`bpm` integer,
	`completed` integer DEFAULT false NOT NULL,
	`skipped` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`session_id`, `idx`),
	FOREIGN KEY (`session_id`) REFERENCES `practice_session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- M3 left due_at/ease empty: mastered skills enter the review schedule one day after mastery.
UPDATE `skill_state` SET `ease` = 0, `due_at` = coalesce(`mastered_at`, unixepoch()) + 86400 WHERE `status` = 'mastered' AND `due_at` IS NULL;
