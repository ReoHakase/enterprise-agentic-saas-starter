CREATE TABLE `agent_thread_permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`context_epoch` integer NOT NULL,
	`mode` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`thread_id`) REFERENCES `agent_threads`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_thread_permissions_mode_check" CHECK("agent_thread_permissions"."mode" in ('ask_always', 'full_access')),
	CONSTRAINT "agent_thread_permissions_epoch_check" CHECK("agent_thread_permissions"."context_epoch" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_thread_permissions_scope_uidx` ON `agent_thread_permissions` (`session_id`,`user_id`,`organization_id`,`thread_id`);--> statement-breakpoint
CREATE INDEX `agent_thread_permissions_session_epoch_idx` ON `agent_thread_permissions` (`session_id`,`context_epoch`);--> statement-breakpoint
ALTER TABLE `agent_threads` ADD `title_state_v2` text DEFAULT 'untitled' NOT NULL;--> statement-breakpoint
UPDATE `agent_threads`
SET `title_state_v2` = `title_state`;--> statement-breakpoint
ALTER TABLE `agent_threads` ADD `title_revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE `agent_approval_policies`
SET `revoked_at` = max(`created_at`, `updated_at`),
    `updated_at` = max(`created_at`, `updated_at`)
WHERE `revoked_at` IS NULL;
