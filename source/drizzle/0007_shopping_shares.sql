CREATE TABLE `shopping_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`items` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`creator` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shopping_shares_creator_time_idx` ON `shopping_shares` (`creator`,`created_at`);--> statement-breakpoint
CREATE INDEX `shopping_shares_expiry_idx` ON `shopping_shares` (`expires_at`);