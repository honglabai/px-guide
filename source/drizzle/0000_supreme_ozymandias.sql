CREATE TABLE `daily_visits` (
	`day` text NOT NULL,
	`visitor` text NOT NULL,
	PRIMARY KEY(`day`, `visitor`)
);
