CREATE TABLE `catalog_aliases` (
	`namespace` text NOT NULL,
	`identifier` text NOT NULL,
	`product_id` integer NOT NULL,
	PRIMARY KEY(`namespace`, `identifier`),
	FOREIGN KEY (`product_id`) REFERENCES `catalog_products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `catalog_alias_product_idx` ON `catalog_aliases` (`product_id`);--> statement-breakpoint
CREATE TABLE `catalog_assets` (
	`product_id` integer NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`product_id`, `kind`),
	FOREIGN KEY (`product_id`) REFERENCES `catalog_products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `catalog_brands` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_brands_name_unique` ON `catalog_brands` (`name`);--> statement-breakpoint
CREATE TABLE `catalog_categories` (
	`id` integer PRIMARY KEY NOT NULL,
	`parent_id` integer,
	`level` integer NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `catalog_categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "catalog_category_shape" CHECK(length("catalog_categories"."code")="catalog_categories"."level"*2 AND "catalog_categories"."code" NOT GLOB '*[^0-9]*' AND "catalog_categories"."level" BETWEEN 1 AND 3),
	CONSTRAINT "catalog_category_parent" CHECK(("catalog_categories"."level"=1 AND "catalog_categories"."parent_id" IS NULL) OR ("catalog_categories"."level">1 AND "catalog_categories"."parent_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_categories_code_unique` ON `catalog_categories` (`code`);--> statement-breakpoint
CREATE TABLE `catalog_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`product_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`is_current` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `catalog_products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `catalog_categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "catalog_code_shape" CHECK(length("catalog_codes"."code")=12 AND "catalog_codes"."code" NOT GLOB '*[^0-9]*' AND substr("catalog_codes"."code",7,6)!='000000'),
	CONSTRAINT "catalog_code_active" CHECK("catalog_codes"."is_current" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_one_current_code` ON `catalog_codes` (`product_id`) WHERE "catalog_codes"."is_current" = 1;--> statement-breakpoint
CREATE TABLE `catalog_discounts` (
	`month` text NOT NULL,
	`product_id` integer NOT NULL,
	`regular_price` real,
	`sale_price` real,
	PRIMARY KEY(`month`, `product_id`),
	FOREIGN KEY (`product_id`) REFERENCES `catalog_products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `catalog_documents` (
	`name` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `catalog_prices` (
	`product_id` integer NOT NULL,
	`kind` text NOT NULL,
	`amount` real NOT NULL,
	PRIMARY KEY(`product_id`, `kind`),
	FOREIGN KEY (`product_id`) REFERENCES `catalog_products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `catalog_products` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`brand_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`tax_type` text NOT NULL,
	`sort_order` integer NOT NULL,
	`visible` integer NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `catalog_brands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `catalog_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_products_slug_unique` ON `catalog_products` (`slug`);--> statement-breakpoint
CREATE INDEX `catalog_product_category_idx` ON `catalog_products` (`category_id`);--> statement-breakpoint
CREATE TABLE `catalog_records` (
	`product_id` integer NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`product_id`, `kind`),
	FOREIGN KEY (`product_id`) REFERENCES `catalog_products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `catalog_sequences` (
	`category_id` integer PRIMARY KEY NOT NULL,
	`last_sequence` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `catalog_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `catalog_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `catalog_texts` (
	`id` integer PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_texts_value_unique` ON `catalog_texts` (`value`);--> statement-breakpoint
ALTER TABLE `coupang_price_current` ADD `catalog_product_key` integer REFERENCES catalog_products(id);--> statement-breakpoint
ALTER TABLE `price_history` ADD `catalog_product_key` integer REFERENCES catalog_products(id);--> statement-breakpoint
ALTER TABLE `price_update_queue` ADD `catalog_product_key` integer REFERENCES catalog_products(id);--> statement-breakpoint
ALTER TABLE `product_interest_daily` ADD `catalog_product_key` integer REFERENCES catalog_products(id);
--> statement-breakpoint
CREATE TRIGGER catalog_link_coupang_price_current_insert AFTER INSERT ON coupang_price_current BEGIN UPDATE coupang_price_current SET catalog_product_key=(SELECT id FROM catalog_products WHERE slug=NEW.product_slug) WHERE rowid=NEW.rowid; END;

--> statement-breakpoint
CREATE TRIGGER catalog_link_coupang_price_current_slug_update AFTER UPDATE OF product_slug ON coupang_price_current BEGIN UPDATE coupang_price_current SET catalog_product_key=(SELECT id FROM catalog_products WHERE slug=NEW.product_slug) WHERE rowid=NEW.rowid; END;

--> statement-breakpoint
CREATE TRIGGER catalog_link_price_history_insert AFTER INSERT ON price_history BEGIN UPDATE price_history SET catalog_product_key=(SELECT id FROM catalog_products WHERE slug=NEW.product_slug) WHERE rowid=NEW.rowid; END;

--> statement-breakpoint
CREATE TRIGGER catalog_link_price_history_slug_update AFTER UPDATE OF product_slug ON price_history BEGIN UPDATE price_history SET catalog_product_key=(SELECT id FROM catalog_products WHERE slug=NEW.product_slug) WHERE rowid=NEW.rowid; END;

--> statement-breakpoint
CREATE TRIGGER catalog_link_price_update_queue_insert AFTER INSERT ON price_update_queue BEGIN UPDATE price_update_queue SET catalog_product_key=(SELECT id FROM catalog_products WHERE slug=NEW.product_slug) WHERE rowid=NEW.rowid; END;

--> statement-breakpoint
CREATE TRIGGER catalog_link_price_update_queue_slug_update AFTER UPDATE OF product_slug ON price_update_queue BEGIN UPDATE price_update_queue SET catalog_product_key=(SELECT id FROM catalog_products WHERE slug=NEW.product_slug) WHERE rowid=NEW.rowid; END;

--> statement-breakpoint
CREATE TRIGGER catalog_link_product_interest_daily_insert AFTER INSERT ON product_interest_daily BEGIN UPDATE product_interest_daily SET catalog_product_key=(SELECT id FROM catalog_products WHERE slug=NEW.product_slug) WHERE rowid=NEW.rowid; END;

--> statement-breakpoint
CREATE TRIGGER catalog_link_product_interest_daily_slug_update AFTER UPDATE OF product_slug ON product_interest_daily BEGIN UPDATE product_interest_daily SET catalog_product_key=(SELECT id FROM catalog_products WHERE slug=NEW.product_slug) WHERE rowid=NEW.rowid; END;
