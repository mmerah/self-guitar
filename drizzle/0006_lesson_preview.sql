CREATE TABLE `maintenance_task` (
	`key` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
-- M7.1: opening a lesson used to mark it started. Lessons started that way (no practice tied to
-- them) go back to not started, once, at the next startup (runMaintenance in src/lib/core/learn.ts:
-- the lesson -> exercise links live in the content, not here). Only queued where there is a
-- started lesson, so a new database has nothing to run.
INSERT INTO `maintenance_task` (`key`) SELECT 'lesson-preview-cleanup' WHERE EXISTS (SELECT 1 FROM `lesson_progress` WHERE `status` = 'started');
