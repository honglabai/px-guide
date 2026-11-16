CREATE TABLE `feedback_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`nickname` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`edit_hash` text NOT NULL,
	`creator` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `feedback_posts_created_idx` ON `feedback_posts` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `feedback_posts_creator_idx` ON `feedback_posts` (`creator`,`created_at`);