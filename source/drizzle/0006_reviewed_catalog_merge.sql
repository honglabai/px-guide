CREATE TABLE `catalog_merge_archive` (
	`batch_id` text NOT NULL,
	`table_name` text NOT NULL,
	`row_key` text NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`batch_id`, `table_name`, `row_key`),
	FOREIGN KEY (`batch_id`) REFERENCES `catalog_merge_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `catalog_merge_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`from_version` text NOT NULL,
	`to_version` text NOT NULL,
	`status` text NOT NULL,
	`guard` integer NOT NULL,
	`created_at` text NOT NULL,
	`applied_at` text,
	CONSTRAINT "catalog_merge_guard" CHECK("catalog_merge_runs"."guard"=1),
	CONSTRAINT "catalog_merge_status" CHECK("catalog_merge_runs"."status" IN ('prepared','applied'))
);
