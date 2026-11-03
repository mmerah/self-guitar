CREATE TABLE `exercise_attempt` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`exercise_id` text NOT NULL,
	`bpm` integer NOT NULL,
	`clean` integer NOT NULL,
	`ladder_bpm` integer NOT NULL,
	`mastered` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `exercise_attempt_idx` ON `exercise_attempt` (`profile_id`,`exercise_id`);--> statement-breakpoint
CREATE TABLE `lesson_progress` (
	`profile_id` integer NOT NULL,
	`lesson_id` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`completed_at` integer,
	PRIMARY KEY(`profile_id`, `lesson_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `mastery_record` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`lesson_id` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mastery_record_idx` ON `mastery_record` (`profile_id`,`lesson_id`);--> statement-breakpoint
CREATE TABLE `skill_state` (
	`profile_id` integer NOT NULL,
	`skill_id` text NOT NULL,
	`status` text NOT NULL,
	`mastered_at` integer,
	`due_at` integer,
	`ease` real,
	PRIMARY KEY(`profile_id`, `skill_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE cascade
);
