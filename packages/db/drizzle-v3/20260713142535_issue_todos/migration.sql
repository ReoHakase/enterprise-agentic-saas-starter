UPDATE `member` SET `role` = 'super_admin' WHERE `role` = 'owner';
--> statement-breakpoint
CREATE TABLE `__new_todos` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`priority` text DEFAULT 'no_priority' NOT NULL,
	`assignee_id` text,
	`creator_id` text NOT NULL,
	`labels` text DEFAULT '[]' NOT NULL,
	`due_date` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`creator_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_todos` (
	`id`,
	`organization_id`,
	`number`,
	`title`,
	`description`,
	`status`,
	`priority`,
	`assignee_id`,
	`creator_id`,
	`labels`,
	`due_date`,
	`created_at`,
	`updated_at`
)
WITH `numbered_todos` AS (
	SELECT
		`id`,
		row_number() OVER (
			PARTITION BY `organization_id`
			ORDER BY `created_at`, `id`
		) AS `organization_number`
	FROM `todos`
)
SELECT
	`todos`.`id`,
	`todos`.`organization_id`,
	`numbered_todos`.`organization_number`,
	`todos`.`title`,
	'',
	CASE WHEN `todos`.`completed` = 1 THEN 'closed' ELSE 'open' END,
	'no_priority',
	NULL,
	COALESCE(
		(
			SELECT `member`.`user_id`
			FROM `member`
			WHERE `member`.`organization_id` = `todos`.`organization_id`
			ORDER BY
				CASE WHEN `member`.`role` = 'super_admin' THEN 0 ELSE 1 END,
				`member`.`created_at`,
				`member`.`id`
			LIMIT 1
		),
		(SELECT `user`.`id` FROM `user` ORDER BY `user`.`created_at`, `user`.`id` LIMIT 1)
	),
	'[]',
	NULL,
	`todos`.`created_at`,
	`todos`.`updated_at`
FROM `todos`
INNER JOIN `numbered_todos` ON `numbered_todos`.`id` = `todos`.`id`;
--> statement-breakpoint
DROP TABLE `todos`;
--> statement-breakpoint
ALTER TABLE `__new_todos` RENAME TO `todos`;
--> statement-breakpoint
CREATE UNIQUE INDEX `todos_organization_number_uidx` ON `todos` (`organization_id`,`number`);
--> statement-breakpoint
CREATE INDEX `todos_organization_status_idx` ON `todos` (`organization_id`,`status`);
--> statement-breakpoint
CREATE INDEX `todos_organization_assignee_idx` ON `todos` (`organization_id`,`assignee_id`);
--> statement-breakpoint
CREATE INDEX `todos_organization_creator_idx` ON `todos` (`organization_id`,`creator_id`);
--> statement-breakpoint
CREATE INDEX `todos_organization_due_date_idx` ON `todos` (`organization_id`,`due_date`);
--> statement-breakpoint
CREATE TABLE `todo_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`todo_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`todo_id`) REFERENCES `todos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `todo_comments_organization_todo_created_idx` ON `todo_comments` (`organization_id`,`todo_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `todo_comments_organization_author_idx` ON `todo_comments` (`organization_id`,`author_id`);
