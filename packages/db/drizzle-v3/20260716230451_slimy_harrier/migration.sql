ALTER TABLE `todo_comments` RENAME TO `issue_comments`;--> statement-breakpoint
ALTER TABLE `todos` RENAME TO `issues`;--> statement-breakpoint
ALTER TABLE `issue_comments` RENAME COLUMN `todo_id` TO `issue_id`;--> statement-breakpoint

DROP INDEX `todos_organization_number_uidx`;--> statement-breakpoint
DROP INDEX `todos_id_organization_uidx`;--> statement-breakpoint
DROP INDEX `todos_organization_status_idx`;--> statement-breakpoint
DROP INDEX `todos_organization_assignee_idx`;--> statement-breakpoint
DROP INDEX `todos_organization_creator_idx`;--> statement-breakpoint
DROP INDEX `todos_organization_due_date_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `issues_organization_number_uidx` ON `issues` (`organization_id`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `issues_id_organization_uidx` ON `issues` (`id`,`organization_id`);--> statement-breakpoint
CREATE INDEX `issues_organization_status_idx` ON `issues` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `issues_organization_assignee_idx` ON `issues` (`organization_id`,`assignee_id`);--> statement-breakpoint
CREATE INDEX `issues_organization_creator_idx` ON `issues` (`organization_id`,`creator_id`);--> statement-breakpoint
CREATE INDEX `issues_organization_due_date_idx` ON `issues` (`organization_id`,`due_date`);--> statement-breakpoint

PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_issue_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `issue_comments_issue_tenant_fk` FOREIGN KEY (`issue_id`,`organization_id`) REFERENCES `issues`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_issue_comments` (`id`,`issue_id`,`organization_id`,`author_id`,`body`,`created_at`,`updated_at`)
SELECT `id`,`issue_id`,`organization_id`,`author_id`,`body`,`created_at`,`updated_at` FROM `issue_comments`;--> statement-breakpoint
DROP TABLE `issue_comments`;--> statement-breakpoint
ALTER TABLE `__new_issue_comments` RENAME TO `issue_comments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `issue_comments_organization_issue_created_idx` ON `issue_comments` (`organization_id`,`issue_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `issue_comments_organization_author_idx` ON `issue_comments` (`organization_id`,`author_id`);--> statement-breakpoint

CREATE TABLE `issue_activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`issue_id` text NOT NULL,
	`actor_user_id` text,
	`batch_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`kind` text NOT NULL,
	`field` text,
	`from_value` text,
	`to_value` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT `issue_activity_events_issue_tenant_fk` FOREIGN KEY (`issue_id`,`organization_id`) REFERENCES `issues`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `issue_activity_events_issue_created_idx` ON `issue_activity_events` (`organization_id`,`issue_id`,`created_at`,`position`);--> statement-breakpoint

INSERT INTO `issue_activity_events` (`id`,`organization_id`,`issue_id`,`actor_user_id`,`batch_id`,`position`,`kind`,`field`,`from_value`,`to_value`,`created_at`)
SELECT `audit_logs`.`id` || '-activity', `audit_logs`.`organization_id`, `audit_logs`.`target_id`, `audit_logs`.`actor_user_id`, `audit_logs`.`id`, 0,
  CASE WHEN `audit_logs`.`action` = 'todo.created' THEN 'created' ELSE 'legacy_updated' END,
  NULL, NULL, NULL, `audit_logs`.`created_at`
FROM `audit_logs`
INNER JOIN `issues` ON `issues`.`id` = `audit_logs`.`target_id` AND `issues`.`organization_id` = `audit_logs`.`organization_id`
WHERE `audit_logs`.`action` IN ('todo.created', 'todo.updated') AND `audit_logs`.`target_type` = 'todo';--> statement-breakpoint

UPDATE `audit_logs` SET
  `action` = CASE `action`
    WHEN 'todo.created' THEN 'issue.created'
    WHEN 'todo.updated' THEN 'issue.updated'
    WHEN 'todo.deleted' THEN 'issue.deleted'
    WHEN 'todo.comment.created' THEN 'issue.comment.created'
    WHEN 'todo.comment.updated' THEN 'issue.comment.updated'
    WHEN 'todo.comment.deleted' THEN 'issue.comment.deleted'
    ELSE `action`
  END,
  `target_type` = CASE `target_type`
    WHEN 'todo' THEN 'issue'
    WHEN 'todo_comment' THEN 'issue_comment'
    ELSE `target_type`
  END,
  `metadata` = CASE
    WHEN json_type(`metadata`, '$.todoId') IS NOT NULL
      THEN json_set(json_remove(`metadata`, '$.todoId'), '$.issueId', json_extract(`metadata`, '$.todoId'))
    ELSE `metadata`
  END
WHERE `action` LIKE 'todo.%' OR `target_type` IN ('todo', 'todo_comment');
