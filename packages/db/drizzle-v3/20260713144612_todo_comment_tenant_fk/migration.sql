CREATE UNIQUE INDEX `todos_id_organization_uidx` ON `todos` (`id`,`organization_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_todo_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`todo_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`todo_id`,`organization_id`) REFERENCES `todos`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_todo_comments`("id", "todo_id", "organization_id", "author_id", "body", "created_at", "updated_at") SELECT "id", "todo_id", "organization_id", "author_id", "body", "created_at", "updated_at" FROM `todo_comments`;--> statement-breakpoint
DROP TABLE `todo_comments`;--> statement-breakpoint
ALTER TABLE `__new_todo_comments` RENAME TO `todo_comments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `todo_comments_organization_todo_created_idx` ON `todo_comments` (`organization_id`,`todo_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `todo_comments_organization_author_idx` ON `todo_comments` (`organization_id`,`author_id`);
