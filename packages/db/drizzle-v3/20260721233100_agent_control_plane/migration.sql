CREATE TABLE `agent_connection_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`organization_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`context_epoch` integer NOT NULL,
	`issued_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`thread_id`) REFERENCES `agent_threads`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_connection_tickets_hash_check" CHECK(length("agent_connection_tickets"."token_hash") = 64
        and "agent_connection_tickets"."token_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "agent_connection_tickets_epoch_check" CHECK("agent_connection_tickets"."context_epoch" >= 1),
	CONSTRAINT "agent_connection_tickets_expiry_check" CHECK("agent_connection_tickets"."expires_at" > "agent_connection_tickets"."issued_at"
        and "agent_connection_tickets"."expires_at" <= "agent_connection_tickets"."issued_at" + 60000),
	CONSTRAINT "agent_connection_tickets_terminal_check" CHECK(not (
        "agent_connection_tickets"."consumed_at" is not null
        and "agent_connection_tickets"."revoked_at" is not null
      )
      and ("agent_connection_tickets"."consumed_at" is null or "agent_connection_tickets"."consumed_at" >= "agent_connection_tickets"."issued_at")
      and ("agent_connection_tickets"."revoked_at" is null or "agent_connection_tickets"."revoked_at" >= "agent_connection_tickets"."issued_at"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_connection_tickets_hash_uidx` ON `agent_connection_tickets` (`token_hash`);--> statement-breakpoint
CREATE INDEX `agent_connection_tickets_expiry_idx` ON `agent_connection_tickets` (`expires_at`);--> statement-breakpoint
CREATE INDEX `agent_connection_tickets_session_epoch_idx` ON `agent_connection_tickets` (`session_id`,`context_epoch`);--> statement-breakpoint
CREATE INDEX `agent_connection_tickets_thread_idx` ON `agent_connection_tickets` (`organization_id`,`thread_id`);--> statement-breakpoint
CREATE TABLE `agent_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`kind` text NOT NULL,
	`organization_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`run_id` text,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`context_epoch` integer NOT NULL,
	`issued_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`thread_id`) REFERENCES `agent_threads`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`run_id`) REFERENCES `agent_runs`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_grants_hash_check" CHECK(length("agent_grants"."token_hash") = 64
        and "agent_grants"."token_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "agent_grants_epoch_check" CHECK("agent_grants"."context_epoch" >= 1),
	CONSTRAINT "agent_grants_kind_check" CHECK("agent_grants"."kind" in ('connection', 'run')),
	CONSTRAINT "agent_grants_run_kind_check" CHECK((
        "agent_grants"."kind" = 'connection'
        and "agent_grants"."run_id" is null
      ) or (
        "agent_grants"."kind" = 'run'
        and "agent_grants"."run_id" is not null
      )),
	CONSTRAINT "agent_grants_expiry_check" CHECK("agent_grants"."expires_at" > "agent_grants"."issued_at"
        and "agent_grants"."expires_at" <= "agent_grants"."issued_at" + 300000),
	CONSTRAINT "agent_grants_revoked_at_check" CHECK("agent_grants"."revoked_at" is null or "agent_grants"."revoked_at" >= "agent_grants"."issued_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_grants_hash_uidx` ON `agent_grants` (`token_hash`);--> statement-breakpoint
CREATE INDEX `agent_grants_expiry_idx` ON `agent_grants` (`expires_at`);--> statement-breakpoint
CREATE INDEX `agent_grants_session_epoch_idx` ON `agent_grants` (`session_id`,`context_epoch`);--> statement-breakpoint
CREATE INDEX `agent_grants_run_idx` ON `agent_grants` (`organization_id`,`run_id`);--> statement-breakpoint
CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`root_run_id` text NOT NULL,
	`parent_run_id` text,
	`resumed_action_id` text,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`context_epoch` integer NOT NULL,
	`client_message_id` text,
	`status` text DEFAULT 'running' NOT NULL,
	`scope` text DEFAULT 'chat' NOT NULL,
	`step_count` integer DEFAULT 0 NOT NULL,
	`tool_count` integer DEFAULT 0 NOT NULL,
	`write_count` integer DEFAULT 0 NOT NULL,
	`input_token_count` integer DEFAULT 0 NOT NULL,
	`output_token_count` integer DEFAULT 0 NOT NULL,
	`started_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`thread_id`) REFERENCES `agent_threads`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`root_run_id`) REFERENCES `agent_runs`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`parent_run_id`) REFERENCES `agent_runs`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agent_runs_epoch_check" CHECK("agent_runs"."context_epoch" >= 1),
	CONSTRAINT "agent_runs_status_check" CHECK("agent_runs"."status" in ('running', 'waiting_approval', 'completed', 'failed', 'canceled', 'expired')),
	CONSTRAINT "agent_runs_scope_check" CHECK("agent_runs"."scope" in ('chat', 'action_resume')),
	CONSTRAINT "agent_runs_client_message_check" CHECK((
        "agent_runs"."scope" = 'chat'
        and length("agent_runs"."client_message_id") between 1 and 128
      ) or (
        "agent_runs"."scope" = 'action_resume'
        and "agent_runs"."client_message_id" is null
      )),
	CONSTRAINT "agent_runs_chain_shape_check" CHECK((
        "agent_runs"."root_run_id" = "agent_runs"."id"
        and "agent_runs"."parent_run_id" is null
        and "agent_runs"."scope" = 'chat'
        and "agent_runs"."resumed_action_id" is null
      ) or (
        "agent_runs"."root_run_id" != "agent_runs"."id"
        and "agent_runs"."parent_run_id" is not null
        and "agent_runs"."scope" = 'action_resume'
        and length("agent_runs"."resumed_action_id") between 1 and 128
        and "agent_runs"."step_count" = 0
        and "agent_runs"."tool_count" = 0
        and "agent_runs"."write_count" = 0
        and "agent_runs"."input_token_count" = 0
        and "agent_runs"."output_token_count" = 0
      )),
	CONSTRAINT "agent_runs_counters_check" CHECK("agent_runs"."step_count" >= 0
        and "agent_runs"."tool_count" >= 0
        and "agent_runs"."write_count" >= 0
        and "agent_runs"."input_token_count" >= 0
        and "agent_runs"."output_token_count" >= 0),
	CONSTRAINT "agent_runs_expiry_check" CHECK("agent_runs"."expires_at" > "agent_runs"."started_at"
        and "agent_runs"."expires_at" <= "agent_runs"."started_at" + 300000),
	CONSTRAINT "agent_runs_finished_at_check" CHECK("agent_runs"."finished_at" is null or "agent_runs"."finished_at" >= "agent_runs"."started_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_runs_organization_id_uidx` ON `agent_runs` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_runs_thread_client_message_uidx` ON `agent_runs` (`thread_id`,`client_message_id`) WHERE "agent_runs"."client_message_id" is not null;--> statement-breakpoint
CREATE INDEX `agent_runs_thread_status_started_idx` ON `agent_runs` (`organization_id`,`thread_id`,`status`,`started_at`);--> statement-breakpoint
CREATE INDEX `agent_runs_root_idx` ON `agent_runs` (`organization_id`,`root_run_id`);--> statement-breakpoint
CREATE INDEX `agent_runs_session_epoch_idx` ON `agent_runs` (`session_id`,`context_epoch`);--> statement-breakpoint
CREATE INDEX `agent_runs_expiry_idx` ON `agent_runs` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `agent_session_contexts` (
	`session_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`context_epoch` integer DEFAULT 1 NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_session_contexts_epoch_check" CHECK("agent_session_contexts"."context_epoch" >= 1)
);
--> statement-breakpoint
CREATE INDEX `agent_session_contexts_user_idx` ON `agent_session_contexts` (`user_id`);--> statement-breakpoint
CREATE TABLE `agent_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_threads_title_check" CHECK(length("agent_threads"."title") between 1 and 120),
	CONSTRAINT "agent_threads_status_check" CHECK("agent_threads"."status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_threads_organization_id_uidx` ON `agent_threads` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `agent_threads_owner_status_updated_idx` ON `agent_threads` (`organization_id`,`owner_user_id`,`status`,`updated_at`);--> statement-breakpoint
INSERT INTO `agent_session_contexts` (
	`session_id`,
	`user_id`,
	`context_epoch`,
	`updated_at`
)
SELECT
	`id`,
	`user_id`,
	1,
	`updated_at`
FROM `session`;
