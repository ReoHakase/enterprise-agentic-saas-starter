PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP TRIGGER IF EXISTS `agent_resource_usage_operations_apply`;--> statement-breakpoint
CREATE TABLE `__new_agent_resource_usage_buckets` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text,
	`kind` text NOT NULL,
	`window_start` integer NOT NULL,
	`window_end` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`limit_count` integer NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_resource_usage_buckets_kind_check" CHECK("__new_agent_resource_usage_buckets"."kind" in ('asset_upload', 'vision_transform', 'write_action', 'staged_asset', 'pending_upload', 'model_run', 'web_search')),
	CONSTRAINT "agent_resource_usage_buckets_window_check" CHECK("__new_agent_resource_usage_buckets"."window_end" > "__new_agent_resource_usage_buckets"."window_start"),
	CONSTRAINT "agent_resource_usage_buckets_count_check" CHECK("__new_agent_resource_usage_buckets"."limit_count" >= 0 and "__new_agent_resource_usage_buckets"."count" between 0 and "__new_agent_resource_usage_buckets"."limit_count")
);
--> statement-breakpoint
INSERT INTO `__new_agent_resource_usage_buckets`("id", "organization_id", "user_id", "kind", "window_start", "window_end", "count", "limit_count", "updated_at") SELECT "id", "organization_id", "user_id", "kind", "window_start", "window_end", "count", "limit_count", "updated_at" FROM `agent_resource_usage_buckets`;--> statement-breakpoint
DROP TABLE `agent_resource_usage_buckets`;--> statement-breakpoint
ALTER TABLE `__new_agent_resource_usage_buckets` RENAME TO `agent_resource_usage_buckets`;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_resource_usage_buckets_organization_id_uidx` ON `agent_resource_usage_buckets` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_resource_usage_buckets_organization_scope_uidx` ON `agent_resource_usage_buckets` (`organization_id`,`kind`,`window_start`) WHERE "agent_resource_usage_buckets"."user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_resource_usage_buckets_user_scope_uidx` ON `agent_resource_usage_buckets` (`organization_id`,`user_id`,`kind`,`window_start`) WHERE "agent_resource_usage_buckets"."user_id" is not null;--> statement-breakpoint
CREATE INDEX `agent_resource_usage_buckets_window_end_idx` ON `agent_resource_usage_buckets` (`window_end`);--> statement-breakpoint
CREATE TRIGGER `agent_resource_usage_operations_apply`
AFTER INSERT ON `agent_resource_usage_operations`
FOR EACH ROW
BEGIN
  UPDATE `agent_resource_usage_buckets`
  SET `count` = `count` + NEW.`delta`,
      `updated_at` = NEW.`created_at`
  WHERE `organization_id` = NEW.`organization_id`
    AND `id` = NEW.`bucket_id`;
  SELECT CASE WHEN changes() != 1
    THEN RAISE(ABORT, 'agent_resource_usage_bucket_missing') END;
END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `agent_actions_scope_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `agent_session_contexts_revoke_old_epoch`;--> statement-breakpoint
CREATE TABLE `__new_agent_runs` (
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
	`attempt` integer DEFAULT 1 NOT NULL,
	`started_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL,
	`web_search_used_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`thread_id`) REFERENCES `agent_threads`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`root_run_id`) REFERENCES `agent_runs`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`parent_run_id`) REFERENCES `agent_runs`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agent_runs_epoch_check" CHECK("__new_agent_runs"."context_epoch" >= 1),
	CONSTRAINT "agent_runs_status_check" CHECK("__new_agent_runs"."status" in ('running', 'waiting_approval', 'completed', 'failed', 'canceled', 'expired')),
	CONSTRAINT "agent_runs_scope_check" CHECK("__new_agent_runs"."scope" in ('chat', 'action_resume')),
	CONSTRAINT "agent_runs_client_message_check" CHECK((
        "__new_agent_runs"."scope" = 'chat'
        and length("__new_agent_runs"."client_message_id") between 1 and 128
      ) or (
        "__new_agent_runs"."scope" = 'action_resume'
        and "__new_agent_runs"."client_message_id" is null
      )),
	CONSTRAINT "agent_runs_chain_shape_check" CHECK((
        "__new_agent_runs"."root_run_id" = "__new_agent_runs"."id"
        and "__new_agent_runs"."parent_run_id" is null
        and "__new_agent_runs"."scope" = 'chat'
        and "__new_agent_runs"."resumed_action_id" is null
      ) or (
        "__new_agent_runs"."root_run_id" != "__new_agent_runs"."id"
        and "__new_agent_runs"."parent_run_id" is not null
        and "__new_agent_runs"."scope" = 'action_resume'
        and length("__new_agent_runs"."resumed_action_id") between 1 and 128
        and "__new_agent_runs"."step_count" = 0
        and "__new_agent_runs"."tool_count" = 0
        and "__new_agent_runs"."write_count" = 0
        and "__new_agent_runs"."input_token_count" = 0
        and "__new_agent_runs"."output_token_count" = 0
      )),
	CONSTRAINT "agent_runs_counters_check" CHECK("__new_agent_runs"."step_count" >= 0
        and "__new_agent_runs"."tool_count" >= 0
        and "__new_agent_runs"."write_count" >= 0
        and "__new_agent_runs"."input_token_count" >= 0
        and "__new_agent_runs"."output_token_count" >= 0),
	CONSTRAINT "agent_runs_attempt_check" CHECK("__new_agent_runs"."attempt" >= 1),
	CONSTRAINT "agent_runs_expiry_check" CHECK("__new_agent_runs"."expires_at" > "__new_agent_runs"."started_at"
        and "__new_agent_runs"."expires_at" <= "__new_agent_runs"."started_at" + 300000),
	CONSTRAINT "agent_runs_finished_at_check" CHECK("__new_agent_runs"."finished_at" is null or "__new_agent_runs"."finished_at" >= "__new_agent_runs"."started_at"),
	CONSTRAINT "agent_runs_web_search_used_at_check" CHECK("__new_agent_runs"."web_search_used_at" is null or (
        "__new_agent_runs"."web_search_used_at" >= "__new_agent_runs"."started_at"
        and "__new_agent_runs"."web_search_used_at" <= "__new_agent_runs"."expires_at"
      ))
);
--> statement-breakpoint
INSERT INTO `__new_agent_runs`("id", "organization_id", "thread_id", "root_run_id", "parent_run_id", "resumed_action_id", "session_id", "user_id", "context_epoch", "client_message_id", "status", "scope", "step_count", "tool_count", "write_count", "input_token_count", "output_token_count", "attempt", "started_at", "expires_at", "web_search_used_at", "finished_at") SELECT "id", "organization_id", "thread_id", "root_run_id", "parent_run_id", "resumed_action_id", "session_id", "user_id", "context_epoch", "client_message_id", "status", "scope", "step_count", "tool_count", "write_count", "input_token_count", "output_token_count", 1, "started_at", "expires_at", NULL, "finished_at" FROM `agent_runs`;--> statement-breakpoint
DROP TABLE `agent_runs`;--> statement-breakpoint
ALTER TABLE `__new_agent_runs` RENAME TO `agent_runs`;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_runs_organization_id_uidx` ON `agent_runs` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_runs_action_scope_uidx` ON `agent_runs` (`organization_id`,`id`,`thread_id`,`session_id`,`user_id`,`context_epoch`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_runs_usage_scope_uidx` ON `agent_runs` (`organization_id`,`id`,`thread_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_runs_thread_client_message_uidx` ON `agent_runs` (`thread_id`,`client_message_id`) WHERE "agent_runs"."client_message_id" is not null;--> statement-breakpoint
CREATE INDEX `agent_runs_thread_status_started_idx` ON `agent_runs` (`organization_id`,`thread_id`,`status`,`started_at`);--> statement-breakpoint
CREATE INDEX `agent_runs_root_idx` ON `agent_runs` (`organization_id`,`root_run_id`);--> statement-breakpoint
CREATE INDEX `agent_runs_session_epoch_idx` ON `agent_runs` (`session_id`,`context_epoch`);--> statement-breakpoint
CREATE INDEX `agent_runs_expiry_idx` ON `agent_runs` (`status`,`expires_at`);--> statement-breakpoint
CREATE TRIGGER `agent_actions_scope_insert`
BEFORE INSERT ON `agent_actions`
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NEW.`status` NOT IN ('pending', 'approved')
    THEN RAISE(ABORT, 'agent_action_invalid_initial_status') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM `session` s
    JOIN `agent_session_contexts` c
      ON c.`session_id` = s.`id` AND c.`user_id` = s.`user_id`
    JOIN `member` m
      ON m.`organization_id` = NEW.`organization_id` AND m.`user_id` = NEW.`user_id`
    JOIN `agent_threads` t
      ON t.`organization_id` = NEW.`organization_id`
      AND t.`id` = NEW.`thread_id`
      AND t.`owner_user_id` = NEW.`user_id`
      AND t.`status` = 'active'
    JOIN `agent_runs` r
      ON r.`organization_id` = NEW.`organization_id`
      AND r.`id` = NEW.`run_id`
      AND r.`thread_id` = NEW.`thread_id`
      AND r.`session_id` = NEW.`session_id`
      AND r.`user_id` = NEW.`user_id`
      AND r.`context_epoch` = NEW.`context_epoch`
    WHERE s.`id` = NEW.`session_id`
      AND s.`user_id` = NEW.`user_id`
      AND s.`active_organization_id` = NEW.`organization_id`
      AND s.`expires_at` > NEW.`created_at`
      AND c.`context_epoch` = NEW.`context_epoch`
  ) THEN RAISE(ABORT, 'agent_action_requires_current_context') END;
  SELECT CASE WHEN NEW.`kind` = 'create_issue' AND EXISTS (
    SELECT 1 FROM `issues`
    WHERE `organization_id` = NEW.`organization_id` AND `id` = NEW.`target_id`
  ) THEN RAISE(ABORT, 'agent_action_create_target_exists') END;
  SELECT CASE WHEN NEW.`kind` IN ('update_issue', 'delete_issue') AND NOT EXISTS (
    SELECT 1 FROM `issues`
    WHERE `organization_id` = NEW.`organization_id`
      AND `id` = NEW.`target_id`
      AND `revision` = NEW.`target_revision`
  ) THEN RAISE(ABORT, 'agent_action_target_revision_conflict') END;
  SELECT CASE WHEN NEW.`status` = 'approved' AND (
    NEW.`decision_provenance` != 'auto_policy'
    OR NOT EXISTS (
      SELECT 1 FROM `agent_approval_policies` p
      WHERE p.`organization_id` = NEW.`organization_id`
        AND p.`id` = NEW.`decision_policy_id`
        AND p.`thread_id` = NEW.`thread_id`
        AND p.`session_id` = NEW.`session_id`
        AND p.`user_id` = NEW.`user_id`
        AND p.`context_epoch` = NEW.`context_epoch`
        AND p.`revoked_at` IS NULL
        AND p.`created_at` <= NEW.`decided_at`
        AND p.`expires_at` >= NEW.`decided_at`
        AND (
          p.`mode` = 'auto_all'
          OR (p.`mode` = 'auto_write' AND NEW.`kind` IN ('create_issue', 'update_issue'))
        )
    )
  ) THEN RAISE(ABORT, 'agent_action_auto_policy_invalid') END;
END;--> statement-breakpoint
CREATE TRIGGER `agent_session_contexts_revoke_old_epoch`
AFTER UPDATE OF `context_epoch` ON `agent_session_contexts`
FOR EACH ROW
WHEN NEW.`context_epoch` = OLD.`context_epoch` + 1
BEGIN
  UPDATE `agent_connection_tickets`
  SET `revoked_at` = coalesce(`revoked_at`, NEW.`updated_at`)
  WHERE `session_id` = OLD.`session_id`
    AND `user_id` = OLD.`user_id`
    AND `context_epoch` = OLD.`context_epoch`
    AND `consumed_at` IS NULL;
  UPDATE `agent_grants`
  SET `revoked_at` = coalesce(`revoked_at`, NEW.`updated_at`)
  WHERE `session_id` = OLD.`session_id`
    AND `user_id` = OLD.`user_id`
    AND `context_epoch` = OLD.`context_epoch`;
  UPDATE `agent_resume_tickets`
  SET `revoked_at` = coalesce(`revoked_at`, NEW.`updated_at`)
  WHERE `session_id` = OLD.`session_id`
    AND `user_id` = OLD.`user_id`
    AND `context_epoch` = OLD.`context_epoch`
    AND `consumed_at` IS NULL;
  UPDATE `agent_actions`
  SET `status` = 'canceled',
      `completed_at` = NEW.`updated_at`,
      `updated_at` = NEW.`updated_at`
  WHERE `session_id` = OLD.`session_id`
    AND `user_id` = OLD.`user_id`
    AND `context_epoch` = OLD.`context_epoch`
    AND `status` IN ('pending', 'approved');
  UPDATE `agent_runs`
  SET `status` = 'canceled',
      `finished_at` = NEW.`updated_at`
  WHERE `session_id` = OLD.`session_id`
    AND `user_id` = OLD.`user_id`
    AND `context_epoch` = OLD.`context_epoch`
    AND `status` IN ('running', 'waiting_approval');
  UPDATE `agent_approval_policies`
  SET `revoked_at` = coalesce(`revoked_at`, NEW.`updated_at`),
      `updated_at` = NEW.`updated_at`
  WHERE `session_id` = OLD.`session_id`
    AND `user_id` = OLD.`user_id`
    AND `context_epoch` = OLD.`context_epoch`;
END;--> statement-breakpoint
CREATE TRIGGER `agent_runs_required_identifiers_insert`
BEFORE INSERT ON `agent_runs`
FOR EACH ROW
WHEN (NEW.`scope` = 'chat' AND NEW.`client_message_id` IS NULL)
  OR (NEW.`scope` = 'action_resume' AND NEW.`resumed_action_id` IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'agent_run_required_identifier_missing');
END;--> statement-breakpoint
CREATE TRIGGER `agent_runs_required_identifiers_update`
BEFORE UPDATE OF `scope`, `client_message_id`, `resumed_action_id` ON `agent_runs`
FOR EACH ROW
WHEN (NEW.`scope` = 'chat' AND NEW.`client_message_id` IS NULL)
  OR (NEW.`scope` = 'action_resume' AND NEW.`resumed_action_id` IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'agent_run_required_identifier_missing');
END;--> statement-breakpoint
CREATE TRIGGER `agent_runs_resume_action_scope_insert`
BEFORE INSERT ON `agent_runs`
FOR EACH ROW
WHEN NEW.`scope` = 'action_resume'
  AND NOT EXISTS (
    SELECT 1 FROM `agent_actions` a
    WHERE a.`organization_id` = NEW.`organization_id`
      AND a.`id` = NEW.`resumed_action_id`
      AND a.`thread_id` = NEW.`thread_id`
      AND a.`session_id` = NEW.`session_id`
      AND a.`user_id` = NEW.`user_id`
      AND a.`context_epoch` = NEW.`context_epoch`
      AND a.`status` = 'approved'
  )
BEGIN
  SELECT RAISE(ABORT, 'agent_resume_run_requires_approved_action');
END;--> statement-breakpoint
PRAGMA foreign_keys=ON;
