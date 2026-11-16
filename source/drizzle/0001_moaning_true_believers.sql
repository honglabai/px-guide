CREATE TABLE `coupang_price_current` (
	`product_slug` text PRIMARY KEY NOT NULL,
	`product_id` text,
	`item_id` text,
	`vendor_item_id` text,
	`normalized_name` text NOT NULL,
	`normalized_spec` text NOT NULL,
	`normalized_quantity` text NOT NULL,
	`displayed_price` integer NOT NULL,
	`shipping_fee` integer,
	`seller` text,
	`price_condition` text,
	`source_url` text NOT NULL,
	`match_score` integer NOT NULL,
	`checked_at` text NOT NULL,
	`last_history_id` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `price_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_slug` text NOT NULL,
	`observation_id` text,
	`entry_kind` text NOT NULL,
	`original_history_id` integer,
	`attempted_at` text NOT NULL,
	`observed_at` text,
	`source_url` text,
	`observed_title` text,
	`observed_option` text,
	`observed_spec` text,
	`observed_quantity` text,
	`observed_price` integer,
	`shipping_fee` integer,
	`seller` text,
	`price_condition` text,
	`match_score` integer,
	`match_reasons` text,
	`hard_mismatch` integer,
	`change_percent` real,
	`status` text NOT NULL,
	`reason` text,
	`reviewer` text,
	`reviewed_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `price_history_product_time_idx` ON `price_history` (`product_slug`,`attempted_at`);--> statement-breakpoint
CREATE INDEX `price_history_status_idx` ON `price_history` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `price_history_observation_uidx` ON `price_history` (`observation_id`);--> statement-breakpoint
CREATE TABLE `price_update_queue` (
	`product_slug` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` text,
	`next_attempt_at` text,
	`lock_expires_at` text,
	`last_checked_at` text,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `price_queue_ready_idx` ON `price_update_queue` (`status`,`next_attempt_at`,`priority`);--> statement-breakpoint
CREATE INDEX `price_queue_lock_idx` ON `price_update_queue` (`status`,`lock_expires_at`);--> statement-breakpoint
CREATE TABLE `product_interest_daily` (
	`day` text NOT NULL,
	`product_slug` text NOT NULL,
	`favorite_adds` integer DEFAULT 0 NOT NULL,
	`shopping_adds` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `product_slug`)
);
--> statement-breakpoint
CREATE INDEX `product_interest_product_day_idx` ON `product_interest_daily` (`product_slug`,`day`);