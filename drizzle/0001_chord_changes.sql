CREATE TABLE `chord_change_record` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`chord_a` text NOT NULL,
	`chord_b` text NOT NULL,
	`count` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profile`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chord_change_pair_idx` ON `chord_change_record` (`profile_id`,`chord_a`,`chord_b`);