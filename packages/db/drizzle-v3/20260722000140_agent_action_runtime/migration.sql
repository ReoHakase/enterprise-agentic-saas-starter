CREATE TABLE `agent_action_assets` (
	`organization_id` text NOT NULL,
	`action_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`storage_object_id` text,
	`source_etag` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`lease_expires_at` integer NOT NULL,
	`released_at` integer,
	`quota_classified_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`action_id`, `asset_id`),
	FOREIGN KEY (`organization_id`,`action_id`) REFERENCES `agent_actions`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`asset_id`) REFERENCES `agent_assets`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`storage_object_id`) REFERENCES `storage_objects`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agent_action_assets_source_etag_check" CHECK(length("agent_action_assets"."source_etag") between 1 and 128),
	CONSTRAINT "agent_action_assets_size_bytes_check" CHECK("agent_action_assets"."size_bytes" between 0 and 10000000),
	CONSTRAINT "agent_action_assets_lease_check" CHECK("agent_action_assets"."lease_expires_at" > "agent_action_assets"."created_at"
        and ("agent_action_assets"."released_at" is null or "agent_action_assets"."released_at" >= "agent_action_assets"."created_at")
        and ("agent_action_assets"."quota_classified_at" is null or (
          "agent_action_assets"."quota_classified_at" >= "agent_action_assets"."created_at"
          and ("agent_action_assets"."released_at" is null or "agent_action_assets"."quota_classified_at" <= "agent_action_assets"."released_at")
        ))),
	CONSTRAINT "agent_action_assets_storage_state_check" CHECK("agent_action_assets"."storage_object_id" is not null or "agent_action_assets"."released_at" is not null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_action_assets_active_asset_uidx` ON `agent_action_assets` (`asset_id`) WHERE "agent_action_assets"."released_at" is null;--> statement-breakpoint
CREATE INDEX `agent_action_assets_organization_action_idx` ON `agent_action_assets` (`organization_id`,`action_id`);--> statement-breakpoint
CREATE INDEX `agent_action_assets_active_lease_idx` ON `agent_action_assets` (`released_at`,`lease_expires_at`);--> statement-breakpoint
CREATE INDEX `agent_action_assets_storage_object_idx` ON `agent_action_assets` (`storage_object_id`);--> statement-breakpoint
CREATE TABLE `agent_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`run_id` text NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`context_epoch` integer NOT NULL,
	`tool_call_id` text NOT NULL,
	`kind` text NOT NULL,
	`normalized_payload` text,
	`canonical_preview` text,
	`target_type` text DEFAULT 'issue' NOT NULL,
	`target_id` text NOT NULL,
	`target_revision` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`decision_provenance` text,
	`decision_policy_id` text,
	`decision_idempotency_key` text,
	`decided_at` integer,
	`idempotency_key` text NOT NULL,
	`receipt` text,
	`result_id` text,
	`error_classification` text,
	`attempt` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL,
	`completed_at` integer,
	`scrubbed_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`run_id`,`thread_id`,`session_id`,`user_id`,`context_epoch`) REFERENCES `agent_runs`(`organization_id`,`id`,`thread_id`,`session_id`,`user_id`,`context_epoch`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`decision_policy_id`,`thread_id`,`session_id`,`user_id`,`context_epoch`) REFERENCES `agent_approval_policies`(`organization_id`,`id`,`thread_id`,`session_id`,`user_id`,`context_epoch`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agent_actions_kind_check" CHECK("agent_actions"."kind" in ('create_issue', 'update_issue', 'delete_issue')),
	CONSTRAINT "agent_actions_status_check" CHECK("agent_actions"."status" in ('pending', 'approved', 'rejected', 'expired', 'canceled', 'succeeded', 'conflicted')),
	CONSTRAINT "agent_actions_epoch_check" CHECK("agent_actions"."context_epoch" >= 1),
	CONSTRAINT "agent_actions_tool_call_id_check" CHECK(length("agent_actions"."tool_call_id") between 1 and 128),
	CONSTRAINT "agent_actions_target_check" CHECK("agent_actions"."target_type" = 'issue'
        and length("agent_actions"."target_id") between 1 and 128
        and (
          ("agent_actions"."kind" = 'create_issue' and "agent_actions"."target_revision" is null)
          or (
            "agent_actions"."kind" in ('update_issue', 'delete_issue')
            and "agent_actions"."target_revision" is not null
            and "agent_actions"."target_revision" >= 1
          )
        )),
	CONSTRAINT "agent_actions_payload_check" CHECK((
        "agent_actions"."normalized_payload" is not null
        and json_valid("agent_actions"."normalized_payload")
        and "agent_actions"."canonical_preview" is not null
        and json_valid("agent_actions"."canonical_preview")
        and "agent_actions"."scrubbed_at" is null
      ) or (
        "agent_actions"."normalized_payload" is null
        and "agent_actions"."canonical_preview" is null
        and "agent_actions"."scrubbed_at" is not null
        and "agent_actions"."status" in ('rejected', 'expired', 'canceled', 'succeeded', 'conflicted')
      )),
	CONSTRAINT "agent_actions_decision_check" CHECK((
        "agent_actions"."decision_provenance" is null
        and "agent_actions"."decision_policy_id" is null
        and "agent_actions"."decision_idempotency_key" is null
        and "agent_actions"."decided_at" is null
      ) or (
        "agent_actions"."decision_provenance" = 'manual'
        and "agent_actions"."decision_policy_id" is null
        and "agent_actions"."decision_idempotency_key" is not null
        and length("agent_actions"."decision_idempotency_key") between 1 and 128
        and "agent_actions"."decided_at" is not null
      ) or (
        "agent_actions"."decision_provenance" = 'auto_policy'
        and "agent_actions"."decision_policy_id" is not null
        and "agent_actions"."decision_idempotency_key" is null
        and "agent_actions"."decided_at" is not null
      )),
	CONSTRAINT "agent_actions_status_shape_check" CHECK((
        "agent_actions"."status" = 'pending'
        and "agent_actions"."decision_provenance" is null
        and "agent_actions"."completed_at" is null
        and "agent_actions"."receipt" is null
        and "agent_actions"."result_id" is null
        and "agent_actions"."error_classification" is null
      ) or (
        "agent_actions"."status" = 'approved'
        and "agent_actions"."decision_provenance" is not null
        and "agent_actions"."completed_at" is null
        and "agent_actions"."receipt" is null
        and "agent_actions"."result_id" is null
        and "agent_actions"."error_classification" is null
      ) or (
        "agent_actions"."status" = 'rejected'
        and "agent_actions"."decision_provenance" = 'manual'
        and "agent_actions"."completed_at" is not null
        and "agent_actions"."receipt" is null
        and "agent_actions"."result_id" is null
        and "agent_actions"."error_classification" is null
      ) or (
        "agent_actions"."status" in ('expired', 'canceled')
        and "agent_actions"."completed_at" is not null
        and "agent_actions"."receipt" is null
        and "agent_actions"."result_id" is null
        and "agent_actions"."error_classification" is null
      ) or (
        "agent_actions"."status" = 'conflicted'
        and "agent_actions"."decision_provenance" is not null
        and "agent_actions"."completed_at" is not null
        and "agent_actions"."receipt" is null
        and "agent_actions"."result_id" is null
        and "agent_actions"."error_classification" is not null
      ) or (
        "agent_actions"."status" = 'succeeded'
        and "agent_actions"."decision_provenance" is not null
        and "agent_actions"."completed_at" is not null
        and "agent_actions"."receipt" is not null
        and json_valid("agent_actions"."receipt")
        and "agent_actions"."result_id" is not null
        and "agent_actions"."error_classification" is null
      )),
	CONSTRAINT "agent_actions_idempotency_key_check" CHECK(length("agent_actions"."idempotency_key") between 1 and 128),
	CONSTRAINT "agent_actions_result_id_check" CHECK("agent_actions"."result_id" is null or length("agent_actions"."result_id") between 1 and 128),
	CONSTRAINT "agent_actions_error_classification_check" CHECK("agent_actions"."error_classification" is null or (
        length("agent_actions"."error_classification") between 1 and 96
        and "agent_actions"."error_classification" glob '[A-Za-z]*'
        and "agent_actions"."error_classification" not glob '*[^A-Za-z0-9_.:-]*'
      )),
	CONSTRAINT "agent_actions_attempt_check" CHECK("agent_actions"."attempt" >= 0),
	CONSTRAINT "agent_actions_expiry_check" CHECK("agent_actions"."expires_at" > "agent_actions"."created_at"
        and "agent_actions"."expires_at" <= "agent_actions"."created_at" + 900000),
	CONSTRAINT "agent_actions_timestamps_check" CHECK(("agent_actions"."decided_at" is null or (
          "agent_actions"."decided_at" >= "agent_actions"."created_at"
          and "agent_actions"."decided_at" <= "agent_actions"."expires_at"
        ))
        and ("agent_actions"."completed_at" is null or "agent_actions"."completed_at" >= "agent_actions"."created_at")
        and ("agent_actions"."scrubbed_at" is null or (
          "agent_actions"."completed_at" is not null
          and "agent_actions"."scrubbed_at" >= "agent_actions"."completed_at"
        )))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_actions_organization_id_uidx` ON `agent_actions` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_actions_resume_scope_uidx` ON `agent_actions` (`organization_id`,`id`,`thread_id`,`session_id`,`user_id`,`context_epoch`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_actions_idempotency_uidx` ON `agent_actions` (`organization_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_actions_run_tool_call_uidx` ON `agent_actions` (`organization_id`,`run_id`,`tool_call_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_actions_decision_idempotency_uidx` ON `agent_actions` (`organization_id`,`decision_idempotency_key`) WHERE "agent_actions"."decision_idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX `agent_actions_thread_status_created_idx` ON `agent_actions` (`organization_id`,`thread_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_actions_session_epoch_status_idx` ON `agent_actions` (`session_id`,`context_epoch`,`status`);--> statement-breakpoint
CREATE INDEX `agent_actions_expiry_idx` ON `agent_actions` (`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `agent_actions_target_idx` ON `agent_actions` (`organization_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `agent_approval_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`context_epoch` integer NOT NULL,
	`mode` text NOT NULL,
	`destructive_confirmed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`thread_id`) REFERENCES `agent_threads`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_approval_policies_mode_check" CHECK("agent_approval_policies"."mode" in ('ask_each', 'auto_write', 'auto_all')),
	CONSTRAINT "agent_approval_policies_epoch_check" CHECK("agent_approval_policies"."context_epoch" >= 1),
	CONSTRAINT "agent_approval_policies_expiry_check" CHECK("agent_approval_policies"."expires_at" > "agent_approval_policies"."created_at"
        and "agent_approval_policies"."expires_at" <= "agent_approval_policies"."created_at" + 900000),
	CONSTRAINT "agent_approval_policies_destructive_check" CHECK((
        "agent_approval_policies"."mode" = 'auto_all'
        and "agent_approval_policies"."destructive_confirmed_at" is not null
        and "agent_approval_policies"."destructive_confirmed_at" >= "agent_approval_policies"."created_at"
        and "agent_approval_policies"."destructive_confirmed_at" <= "agent_approval_policies"."expires_at"
      ) or (
        "agent_approval_policies"."mode" != 'auto_all'
        and "agent_approval_policies"."destructive_confirmed_at" is null
      )),
	CONSTRAINT "agent_approval_policies_revoked_at_check" CHECK("agent_approval_policies"."revoked_at" is null or "agent_approval_policies"."revoked_at" >= "agent_approval_policies"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_approval_policies_organization_id_uidx` ON `agent_approval_policies` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_approval_policies_action_scope_uidx` ON `agent_approval_policies` (`organization_id`,`id`,`thread_id`,`session_id`,`user_id`,`context_epoch`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_approval_policies_active_scope_uidx` ON `agent_approval_policies` (`session_id`,`user_id`,`organization_id`,`thread_id`) WHERE "agent_approval_policies"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX `agent_approval_policies_expiry_idx` ON `agent_approval_policies` (`revoked_at`,`expires_at`);--> statement-breakpoint
CREATE INDEX `agent_approval_policies_session_epoch_idx` ON `agent_approval_policies` (`session_id`,`context_epoch`);--> statement-breakpoint
CREATE TABLE `agent_resource_usage_buckets` (
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
	CONSTRAINT "agent_resource_usage_buckets_kind_check" CHECK("agent_resource_usage_buckets"."kind" in ('asset_upload', 'vision_transform', 'write_action', 'staged_asset', 'pending_upload')),
	CONSTRAINT "agent_resource_usage_buckets_window_check" CHECK("agent_resource_usage_buckets"."window_end" > "agent_resource_usage_buckets"."window_start"),
	CONSTRAINT "agent_resource_usage_buckets_count_check" CHECK("agent_resource_usage_buckets"."limit_count" >= 0 and "agent_resource_usage_buckets"."count" between 0 and "agent_resource_usage_buckets"."limit_count")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_resource_usage_buckets_organization_id_uidx` ON `agent_resource_usage_buckets` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_resource_usage_buckets_organization_scope_uidx` ON `agent_resource_usage_buckets` (`organization_id`,`kind`,`window_start`) WHERE "agent_resource_usage_buckets"."user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_resource_usage_buckets_user_scope_uidx` ON `agent_resource_usage_buckets` (`organization_id`,`user_id`,`kind`,`window_start`) WHERE "agent_resource_usage_buckets"."user_id" is not null;--> statement-breakpoint
CREATE INDEX `agent_resource_usage_buckets_window_end_idx` ON `agent_resource_usage_buckets` (`window_end`);--> statement-breakpoint
CREATE TABLE `agent_resource_usage_operations` (
	`operation_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`bucket_id` text NOT NULL,
	`delta` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`bucket_id`, `operation_id`),
	FOREIGN KEY (`organization_id`,`bucket_id`) REFERENCES `agent_resource_usage_buckets`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_resource_usage_operations_id_check" CHECK(length("agent_resource_usage_operations"."operation_id") between 1 and 160),
	CONSTRAINT "agent_resource_usage_operations_delta_check" CHECK("agent_resource_usage_operations"."delta" between -1073741824 and 1073741824
        and "agent_resource_usage_operations"."delta" != 0)
);
--> statement-breakpoint
CREATE INDEX `agent_resource_usage_operations_bucket_created_idx` ON `agent_resource_usage_operations` (`organization_id`,`bucket_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `agent_resume_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`action_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`context_epoch` integer NOT NULL,
	`issued_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`organization_id`,`action_id`,`thread_id`,`session_id`,`user_id`,`context_epoch`) REFERENCES `agent_actions`(`organization_id`,`id`,`thread_id`,`session_id`,`user_id`,`context_epoch`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_resume_tickets_hash_check" CHECK(length("agent_resume_tickets"."token_hash") = 64
        and "agent_resume_tickets"."token_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "agent_resume_tickets_epoch_check" CHECK("agent_resume_tickets"."context_epoch" >= 1),
	CONSTRAINT "agent_resume_tickets_expiry_check" CHECK("agent_resume_tickets"."expires_at" > "agent_resume_tickets"."issued_at"
        and "agent_resume_tickets"."expires_at" <= "agent_resume_tickets"."issued_at" + 60000),
	CONSTRAINT "agent_resume_tickets_terminal_check" CHECK(not (
        "agent_resume_tickets"."consumed_at" is not null
        and "agent_resume_tickets"."revoked_at" is not null
      )
      and ("agent_resume_tickets"."consumed_at" is null or "agent_resume_tickets"."consumed_at" >= "agent_resume_tickets"."issued_at")
      and ("agent_resume_tickets"."revoked_at" is null or "agent_resume_tickets"."revoked_at" >= "agent_resume_tickets"."issued_at"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_resume_tickets_hash_uidx` ON `agent_resume_tickets` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_resume_tickets_active_action_uidx` ON `agent_resume_tickets` (`organization_id`,`action_id`) WHERE "agent_resume_tickets"."consumed_at" is null and "agent_resume_tickets"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX `agent_resume_tickets_expiry_idx` ON `agent_resume_tickets` (`expires_at`);--> statement-breakpoint
CREATE INDEX `agent_resume_tickets_action_idx` ON `agent_resume_tickets` (`organization_id`,`action_id`);--> statement-breakpoint
CREATE INDEX `agent_resume_tickets_session_epoch_idx` ON `agent_resume_tickets` (`session_id`,`context_epoch`);--> statement-breakpoint
CREATE TABLE `agent_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`run_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`input_token_count` integer DEFAULT 0 NOT NULL,
	`output_token_count` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer NOT NULL,
	`provider_request_id` text,
	`run_event_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`run_id`,`thread_id`) REFERENCES `agent_runs`(`organization_id`,`id`,`thread_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_usage_events_provider_check" CHECK(length("agent_usage_events"."provider") between 1 and 64),
	CONSTRAINT "agent_usage_events_model_check" CHECK(length("agent_usage_events"."model") between 1 and 160),
	CONSTRAINT "agent_usage_events_counts_check" CHECK("agent_usage_events"."input_token_count" >= 0
        and "agent_usage_events"."output_token_count" >= 0
        and "agent_usage_events"."duration_ms" between 0 and 300000),
	CONSTRAINT "agent_usage_events_idempotency_check" CHECK((
        "agent_usage_events"."provider_request_id" is not null
        and length("agent_usage_events"."provider_request_id") between 1 and 160
      ) or (
        "agent_usage_events"."run_event_id" is not null
        and length("agent_usage_events"."run_event_id") between 1 and 160
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_usage_events_provider_request_uidx` ON `agent_usage_events` (`organization_id`,`provider`,`provider_request_id`) WHERE "agent_usage_events"."provider_request_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_usage_events_run_event_uidx` ON `agent_usage_events` (`organization_id`,`run_id`,`run_event_id`) WHERE "agent_usage_events"."run_event_id" is not null;--> statement-breakpoint
CREATE INDEX `agent_usage_events_run_created_idx` ON `agent_usage_events` (`organization_id`,`run_id`,`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_issues` (
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
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`creator_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "issues_revision_check" CHECK("__new_issues"."revision" >= 1)
);
--> statement-breakpoint
INSERT INTO `__new_issues`("id", "organization_id", "number", "title", "description", "status", "priority", "assignee_id", "creator_id", "labels", "due_date", "revision", "created_at", "updated_at") SELECT "id", "organization_id", "number", "title", "description", "status", "priority", "assignee_id", "creator_id", "labels", "due_date", 1, "created_at", "updated_at" FROM `issues`;--> statement-breakpoint
DROP TABLE `issues`;--> statement-breakpoint
ALTER TABLE `__new_issues` RENAME TO `issues`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `issues_organization_number_uidx` ON `issues` (`organization_id`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `issues_id_organization_uidx` ON `issues` (`id`,`organization_id`);--> statement-breakpoint
CREATE INDEX `issues_organization_status_idx` ON `issues` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `issues_organization_assignee_idx` ON `issues` (`organization_id`,`assignee_id`);--> statement-breakpoint
CREATE INDEX `issues_organization_creator_idx` ON `issues` (`organization_id`,`creator_id`);--> statement-breakpoint
CREATE INDEX `issues_organization_due_date_idx` ON `issues` (`organization_id`,`due_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_runs_action_scope_uidx` ON `agent_runs` (`organization_id`,`id`,`thread_id`,`session_id`,`user_id`,`context_epoch`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_runs_usage_scope_uidx` ON `agent_runs` (`organization_id`,`id`,`thread_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_session_contexts_scope_uidx` ON `agent_session_contexts` (`session_id`,`user_id`,`context_epoch`);
--> statement-breakpoint
CREATE TRIGGER `issues_revision_guard`
BEFORE UPDATE OF `revision` ON `issues`
FOR EACH ROW
WHEN NEW.`revision` != OLD.`revision`
  AND NEW.`revision` != OLD.`revision` + 1
BEGIN
  SELECT RAISE(ABORT, 'issue_revision_must_increment_by_one');
END;
--> statement-breakpoint
CREATE TRIGGER `issues_revision_auto_increment`
AFTER UPDATE OF `title`, `description`, `status`, `priority`, `assignee_id`, `labels`, `due_date` ON `issues`
FOR EACH ROW
WHEN NEW.`revision` = OLD.`revision`
  AND (
    NEW.`title` IS NOT OLD.`title`
    OR NEW.`description` IS NOT OLD.`description`
    OR NEW.`status` IS NOT OLD.`status`
    OR NEW.`priority` IS NOT OLD.`priority`
    OR NEW.`assignee_id` IS NOT OLD.`assignee_id`
    OR NEW.`labels` IS NOT OLD.`labels`
    OR NEW.`due_date` IS NOT OLD.`due_date`
  )
BEGIN
  UPDATE `issues`
  SET `revision` = OLD.`revision` + 1
  WHERE `id` = NEW.`id`
    AND `organization_id` = NEW.`organization_id`
    AND `revision` = OLD.`revision`;
  SELECT CASE WHEN changes() != 1
    THEN RAISE(ABORT, 'issue_revision_concurrent_update')
  END;
END;
--> statement-breakpoint
CREATE TRIGGER `agent_runs_required_identifiers_insert`
BEFORE INSERT ON `agent_runs`
FOR EACH ROW
WHEN (NEW.`scope` = 'chat' AND NEW.`client_message_id` IS NULL)
  OR (NEW.`scope` = 'action_resume' AND NEW.`resumed_action_id` IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'agent_run_required_identifier_missing');
END;
--> statement-breakpoint
CREATE TRIGGER `agent_runs_required_identifiers_update`
BEFORE UPDATE OF `scope`, `client_message_id`, `resumed_action_id` ON `agent_runs`
FOR EACH ROW
WHEN (NEW.`scope` = 'chat' AND NEW.`client_message_id` IS NULL)
  OR (NEW.`scope` = 'action_resume' AND NEW.`resumed_action_id` IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'agent_run_required_identifier_missing');
END;
--> statement-breakpoint
CREATE TRIGGER `agent_approval_policies_scope_insert`
BEFORE INSERT ON `agent_approval_policies`
FOR EACH ROW
BEGIN
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
    WHERE s.`id` = NEW.`session_id`
      AND s.`user_id` = NEW.`user_id`
      AND s.`active_organization_id` = NEW.`organization_id`
      AND s.`expires_at` > NEW.`created_at`
      AND c.`context_epoch` = NEW.`context_epoch`
  ) THEN RAISE(ABORT, 'agent_policy_requires_current_context') END;
END;
--> statement-breakpoint
CREATE TRIGGER `agent_approval_policies_immutable_update`
BEFORE UPDATE ON `agent_approval_policies`
FOR EACH ROW
WHEN NEW.`id` IS NOT OLD.`id`
  OR NEW.`organization_id` IS NOT OLD.`organization_id`
  OR NEW.`thread_id` IS NOT OLD.`thread_id`
  OR NEW.`session_id` IS NOT OLD.`session_id`
  OR NEW.`user_id` IS NOT OLD.`user_id`
  OR NEW.`context_epoch` IS NOT OLD.`context_epoch`
  OR NEW.`mode` IS NOT OLD.`mode`
  OR NEW.`destructive_confirmed_at` IS NOT OLD.`destructive_confirmed_at`
  OR NEW.`created_at` IS NOT OLD.`created_at`
  OR NEW.`expires_at` IS NOT OLD.`expires_at`
  OR (OLD.`revoked_at` IS NOT NULL AND NEW.`revoked_at` IS NOT OLD.`revoked_at`)
  OR NEW.`updated_at` < OLD.`updated_at`
BEGIN
  SELECT RAISE(ABORT, 'agent_policy_immutable_or_invalid_revoke');
END;
--> statement-breakpoint
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
END;
--> statement-breakpoint
CREATE TRIGGER `agent_actions_immutable_update`
BEFORE UPDATE ON `agent_actions`
FOR EACH ROW
WHEN NEW.`id` IS NOT OLD.`id`
  OR NEW.`organization_id` IS NOT OLD.`organization_id`
  OR NEW.`thread_id` IS NOT OLD.`thread_id`
  OR NEW.`run_id` IS NOT OLD.`run_id`
  OR NEW.`session_id` IS NOT OLD.`session_id`
  OR NEW.`user_id` IS NOT OLD.`user_id`
  OR NEW.`context_epoch` IS NOT OLD.`context_epoch`
  OR NEW.`tool_call_id` IS NOT OLD.`tool_call_id`
  OR NEW.`kind` IS NOT OLD.`kind`
  OR NEW.`target_type` IS NOT OLD.`target_type`
  OR NEW.`target_id` IS NOT OLD.`target_id`
  OR NEW.`target_revision` IS NOT OLD.`target_revision`
  OR NEW.`idempotency_key` IS NOT OLD.`idempotency_key`
  OR NEW.`created_at` IS NOT OLD.`created_at`
  OR NEW.`expires_at` IS NOT OLD.`expires_at`
  OR NEW.`attempt` NOT IN (OLD.`attempt`, OLD.`attempt` + 1)
  OR NEW.`updated_at` < OLD.`updated_at`
  OR (
    NEW.`status` = OLD.`status`
    AND (
      NEW.`decision_provenance` IS NOT OLD.`decision_provenance`
      OR NEW.`decision_policy_id` IS NOT OLD.`decision_policy_id`
      OR NEW.`decision_idempotency_key` IS NOT OLD.`decision_idempotency_key`
      OR NEW.`decided_at` IS NOT OLD.`decided_at`
      OR NEW.`receipt` IS NOT OLD.`receipt`
      OR NEW.`result_id` IS NOT OLD.`result_id`
      OR NEW.`error_classification` IS NOT OLD.`error_classification`
      OR NEW.`completed_at` IS NOT OLD.`completed_at`
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'agent_action_immutable_field');
END;
--> statement-breakpoint
CREATE TRIGGER `agent_actions_payload_scrub_update`
BEFORE UPDATE OF `normalized_payload`, `canonical_preview`, `scrubbed_at` ON `agent_actions`
FOR EACH ROW
WHEN (
  NEW.`normalized_payload` IS NOT OLD.`normalized_payload`
  OR NEW.`canonical_preview` IS NOT OLD.`canonical_preview`
  OR NEW.`scrubbed_at` IS NOT OLD.`scrubbed_at`
) AND NOT (
  OLD.`status` IN ('rejected', 'expired', 'canceled', 'succeeded', 'conflicted')
  AND NEW.`status` = OLD.`status`
  AND OLD.`normalized_payload` IS NOT NULL
  AND OLD.`canonical_preview` IS NOT NULL
  AND OLD.`scrubbed_at` IS NULL
  AND NEW.`normalized_payload` IS NULL
  AND NEW.`canonical_preview` IS NULL
  AND NEW.`scrubbed_at` IS NOT NULL
  AND NEW.`scrubbed_at` >= OLD.`completed_at`
)
BEGIN
  SELECT RAISE(ABORT, 'agent_action_payload_immutable_except_scrub');
END;
--> statement-breakpoint
CREATE TRIGGER `agent_actions_state_update`
BEFORE UPDATE OF `status` ON `agent_actions`
FOR EACH ROW
WHEN NEW.`status` != OLD.`status`
BEGIN
  SELECT CASE WHEN NOT (
    (OLD.`status` = 'pending' AND NEW.`status` IN ('approved', 'rejected', 'expired', 'canceled'))
    OR (OLD.`status` = 'approved' AND NEW.`status` IN ('succeeded', 'expired', 'canceled', 'conflicted'))
  ) THEN RAISE(ABORT, 'agent_action_invalid_state_transition') END;

  SELECT CASE WHEN NEW.`status` IN ('approved', 'rejected', 'succeeded')
    AND NOT EXISTS (
      SELECT 1
      FROM `session` s
      JOIN `agent_session_contexts` c
        ON c.`session_id` = s.`id`
        AND c.`user_id` = s.`user_id`
      JOIN `member` m
        ON m.`organization_id` = NEW.`organization_id`
        AND m.`user_id` = NEW.`user_id`
      WHERE s.`id` = NEW.`session_id`
        AND s.`user_id` = NEW.`user_id`
        AND s.`active_organization_id` = NEW.`organization_id`
        AND s.`expires_at` > CAST(unixepoch('subsecond') * 1000 AS INTEGER)
        AND c.`context_epoch` = NEW.`context_epoch`
    ) THEN RAISE(ABORT, 'agent_action_transition_requires_current_context') END;

  SELECT CASE WHEN NEW.`status` IN ('approved', 'rejected')
    AND CAST(unixepoch('subsecond') * 1000 AS INTEGER) >= NEW.`expires_at`
    THEN RAISE(ABORT, 'agent_action_expired') END;

  SELECT CASE WHEN NEW.`status` = 'approved' AND NEW.`decision_provenance` = 'auto_policy'
    AND NOT EXISTS (
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
    ) THEN RAISE(ABORT, 'agent_action_auto_policy_invalid') END;

  SELECT CASE WHEN NEW.`status` = 'succeeded'
    AND NEW.`result_id` != NEW.`target_id`
    THEN RAISE(ABORT, 'agent_action_result_target_mismatch') END;

  SELECT CASE WHEN NEW.`status` = 'succeeded'
    AND NEW.`kind` = 'create_issue'
    AND NOT EXISTS (
      SELECT 1 FROM `issues`
      WHERE `organization_id` = NEW.`organization_id`
        AND `id` = NEW.`target_id`
        AND `revision` = 1
    ) THEN RAISE(ABORT, 'agent_action_create_result_missing') END;

  SELECT CASE WHEN NEW.`status` = 'succeeded'
    AND NEW.`kind` = 'update_issue'
    AND NOT EXISTS (
      SELECT 1 FROM `issues`
      WHERE `organization_id` = NEW.`organization_id`
        AND `id` = NEW.`target_id`
        AND `revision` = NEW.`target_revision` + 1
    ) THEN RAISE(ABORT, 'agent_action_update_revision_mismatch') END;

  SELECT CASE WHEN NEW.`status` = 'succeeded'
    AND NEW.`kind` = 'delete_issue'
    AND EXISTS (
      SELECT 1 FROM `issues`
      WHERE `organization_id` = NEW.`organization_id`
        AND `id` = NEW.`target_id`
    ) THEN RAISE(ABORT, 'agent_action_delete_result_still_exists') END;

  SELECT CASE WHEN NEW.`status` = 'succeeded'
    AND NEW.`kind` = 'create_issue'
    AND EXISTS (
      SELECT 1
      FROM `agent_action_assets` aa
      LEFT JOIN `agent_run_assets` ra
        ON ra.`organization_id` = aa.`organization_id`
        AND ra.`run_id` = NEW.`run_id`
        AND ra.`asset_id` = aa.`asset_id`
        AND ra.`storage_object_id` = aa.`storage_object_id`
        AND ra.`source_etag` = aa.`source_etag`
        AND ra.`size_bytes` = aa.`size_bytes`
      LEFT JOIN `agent_assets` a
        ON a.`organization_id` = aa.`organization_id`
        AND a.`id` = aa.`asset_id`
      LEFT JOIN `files` f
        ON f.`organization_id` = aa.`organization_id`
        AND f.`id` = a.`promoted_file_id`
      LEFT JOIN `issue_file_owners` o
        ON o.`organization_id` = aa.`organization_id`
        AND o.`file_id` = f.`id`
        AND o.`issue_id` = NEW.`target_id`
      LEFT JOIN `storage_object_claims` c
        ON c.`organization_id` = aa.`organization_id`
        AND c.`storage_object_id` = aa.`storage_object_id`
        AND c.`holder_type` = 'file'
        AND c.`holder_id` = f.`id`
      LEFT JOIN `storage_objects` so
        ON so.`organization_id` = aa.`organization_id`
        AND so.`id` = aa.`storage_object_id`
      WHERE aa.`organization_id` = NEW.`organization_id`
        AND aa.`action_id` = NEW.`id`
        AND (
          aa.`released_at` IS NOT NULL
          OR aa.`quota_classified_at` IS NULL
          OR aa.`lease_expires_at` < NEW.`completed_at`
          OR ra.`asset_id` IS NULL
          OR a.`status` != 'promoted'
          OR f.`status` != 'ready'
          OR f.`storage_object_id` IS NOT aa.`storage_object_id`
          OR f.`etag` IS NOT aa.`source_etag`
          OR f.`size_bytes` != aa.`size_bytes`
          OR o.`file_id` IS NULL
          OR c.`storage_object_id` IS NULL
          OR so.`status` != 'ready'
          OR so.`etag` IS NOT aa.`source_etag`
          OR so.`size_bytes` != aa.`size_bytes`
        )
    ) THEN RAISE(ABORT, 'agent_action_attachment_promotion_incomplete') END;
END;
--> statement-breakpoint
CREATE TRIGGER `agent_actions_terminal_release_assets`
AFTER UPDATE OF `status` ON `agent_actions`
FOR EACH ROW
WHEN NEW.`status` IN ('rejected', 'expired', 'canceled', 'succeeded', 'conflicted')
  AND OLD.`status` != NEW.`status`
BEGIN
  UPDATE `agent_action_assets`
  SET `released_at` = NEW.`completed_at`
  WHERE `organization_id` = NEW.`organization_id`
    AND `action_id` = NEW.`id`
    AND `released_at` IS NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `agent_resume_tickets_scope_insert`
BEFORE INSERT ON `agent_resume_tickets`
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM `agent_actions` a
    JOIN `session` s
      ON s.`id` = a.`session_id`
      AND s.`user_id` = a.`user_id`
      AND s.`active_organization_id` = a.`organization_id`
    JOIN `agent_session_contexts` c
      ON c.`session_id` = a.`session_id`
      AND c.`user_id` = a.`user_id`
      AND c.`context_epoch` = a.`context_epoch`
    JOIN `member` m
      ON m.`organization_id` = a.`organization_id`
      AND m.`user_id` = a.`user_id`
    WHERE a.`organization_id` = NEW.`organization_id`
      AND a.`id` = NEW.`action_id`
      AND a.`thread_id` = NEW.`thread_id`
      AND a.`session_id` = NEW.`session_id`
      AND a.`user_id` = NEW.`user_id`
      AND a.`context_epoch` = NEW.`context_epoch`
      AND a.`status` = 'approved'
      AND a.`expires_at` >= NEW.`expires_at`
      AND s.`expires_at` > NEW.`issued_at`
  ) THEN RAISE(ABORT, 'agent_resume_ticket_requires_approved_action') END;
END;
--> statement-breakpoint
CREATE TRIGGER `agent_resume_tickets_terminal_update`
BEFORE UPDATE ON `agent_resume_tickets`
FOR EACH ROW
WHEN NEW.`id` IS NOT OLD.`id`
  OR NEW.`token_hash` IS NOT OLD.`token_hash`
  OR NEW.`action_id` IS NOT OLD.`action_id`
  OR NEW.`organization_id` IS NOT OLD.`organization_id`
  OR NEW.`thread_id` IS NOT OLD.`thread_id`
  OR NEW.`session_id` IS NOT OLD.`session_id`
  OR NEW.`user_id` IS NOT OLD.`user_id`
  OR NEW.`context_epoch` IS NOT OLD.`context_epoch`
  OR NEW.`issued_at` IS NOT OLD.`issued_at`
  OR NEW.`expires_at` IS NOT OLD.`expires_at`
  OR (OLD.`consumed_at` IS NOT NULL AND NEW.`consumed_at` IS NOT OLD.`consumed_at`)
  OR (OLD.`revoked_at` IS NOT NULL AND NEW.`revoked_at` IS NOT OLD.`revoked_at`)
BEGIN
  SELECT RAISE(ABORT, 'agent_resume_ticket_immutable_or_replayed');
END;
--> statement-breakpoint
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
END;
--> statement-breakpoint
CREATE TRIGGER `agent_action_assets_scope_insert`
BEFORE INSERT ON `agent_action_assets`
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM `agent_actions` ac
    JOIN `agent_assets` a
      ON a.`organization_id` = ac.`organization_id`
      AND a.`id` = NEW.`asset_id`
    JOIN `agent_run_assets` ra
      ON ra.`organization_id` = ac.`organization_id`
      AND ra.`run_id` = ac.`run_id`
      AND ra.`asset_id` = NEW.`asset_id`
    JOIN `storage_objects` so
      ON so.`organization_id` = ac.`organization_id`
      AND so.`id` = NEW.`storage_object_id`
    JOIN `storage_object_claims` c
      ON c.`organization_id` = ac.`organization_id`
      AND c.`storage_object_id` = NEW.`storage_object_id`
      AND c.`holder_type` = 'agent_asset'
      AND c.`holder_id` = NEW.`asset_id`
    WHERE ac.`organization_id` = NEW.`organization_id`
      AND ac.`id` = NEW.`action_id`
      AND ac.`kind` = 'create_issue'
      AND ac.`status` IN ('pending', 'approved')
      AND ac.`expires_at` >= NEW.`lease_expires_at`
      AND a.`thread_id` = ac.`thread_id`
      AND a.`session_id` = ac.`session_id`
      AND a.`context_epoch` = ac.`context_epoch`
      AND a.`uploader_id` = ac.`user_id`
      AND a.`status` = 'ready'
      AND a.`expires_at` >= NEW.`lease_expires_at`
      AND a.`storage_object_id` = NEW.`storage_object_id`
      AND ra.`storage_object_id` = NEW.`storage_object_id`
      AND ra.`source_etag` = NEW.`source_etag`
      AND ra.`size_bytes` = NEW.`size_bytes`
      AND so.`status` = 'ready'
      AND so.`etag` = NEW.`source_etag`
      AND so.`size_bytes` = NEW.`size_bytes`
      AND NEW.`released_at` IS NULL
      AND NEW.`quota_classified_at` IS NULL
  ) THEN RAISE(ABORT, 'agent_action_asset_scope_mismatch') END;
END;
--> statement-breakpoint
CREATE TRIGGER `agent_action_assets_immutable_update`
BEFORE UPDATE ON `agent_action_assets`
FOR EACH ROW
WHEN NEW.`organization_id` IS NOT OLD.`organization_id`
  OR NEW.`action_id` IS NOT OLD.`action_id`
  OR NEW.`asset_id` IS NOT OLD.`asset_id`
  OR NEW.`source_etag` IS NOT OLD.`source_etag`
  OR NEW.`size_bytes` IS NOT OLD.`size_bytes`
  OR NEW.`lease_expires_at` IS NOT OLD.`lease_expires_at`
  OR NEW.`created_at` IS NOT OLD.`created_at`
  OR (OLD.`released_at` IS NOT NULL AND NEW.`released_at` IS NOT OLD.`released_at`)
  OR (OLD.`quota_classified_at` IS NOT NULL AND NEW.`quota_classified_at` IS NOT OLD.`quota_classified_at`)
  OR NOT (
    NEW.`storage_object_id` IS OLD.`storage_object_id`
    OR (
      OLD.`storage_object_id` IS NOT NULL
      AND NEW.`storage_object_id` IS NULL
      AND NEW.`released_at` IS NOT NULL
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'agent_action_asset_immutable_field');
END;
--> statement-breakpoint
CREATE TRIGGER `agent_action_assets_release_update`
BEFORE UPDATE OF `released_at` ON `agent_action_assets`
FOR EACH ROW
WHEN OLD.`released_at` IS NULL
  AND NEW.`released_at` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `agent_actions`
    WHERE `organization_id` = NEW.`organization_id`
      AND `id` = NEW.`action_id`
      AND `status` IN ('rejected', 'expired', 'canceled', 'succeeded', 'conflicted')
      AND `completed_at` = NEW.`released_at`
  )
BEGIN
  SELECT RAISE(ABORT, 'agent_action_asset_release_requires_terminal_action');
END;
--> statement-breakpoint
CREATE TRIGGER `agent_action_assets_quota_classify_before`
BEFORE UPDATE OF `quota_classified_at` ON `agent_action_assets`
FOR EACH ROW
WHEN OLD.`quota_classified_at` IS NULL AND NEW.`quota_classified_at` IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM `agent_actions` ac
    JOIN `agent_assets` a
      ON a.`organization_id` = ac.`organization_id`
      AND a.`id` = NEW.`asset_id`
      AND a.`status` = 'promoted'
    JOIN `files` f
      ON f.`organization_id` = ac.`organization_id`
      AND f.`id` = a.`promoted_file_id`
      AND f.`status` = 'ready'
      AND f.`storage_object_id` = NEW.`storage_object_id`
      AND f.`etag` = NEW.`source_etag`
      AND f.`size_bytes` = NEW.`size_bytes`
    JOIN `issue_file_owners` o
      ON o.`organization_id` = ac.`organization_id`
      AND o.`file_id` = f.`id`
      AND o.`issue_id` = ac.`target_id`
    JOIN `storage_object_claims` c
      ON c.`organization_id` = ac.`organization_id`
      AND c.`storage_object_id` = NEW.`storage_object_id`
      AND c.`holder_type` = 'file'
      AND c.`holder_id` = f.`id`
    JOIN `organization_file_usage` u
      ON u.`organization_id` = ac.`organization_id`
      AND u.`temporary_bytes` >= NEW.`size_bytes`
    WHERE ac.`organization_id` = NEW.`organization_id`
      AND ac.`id` = NEW.`action_id`
      AND ac.`kind` = 'create_issue'
      AND ac.`status` = 'approved'
      AND NEW.`released_at` IS NULL
      AND NEW.`lease_expires_at` >= NEW.`quota_classified_at`
  ) THEN RAISE(ABORT, 'agent_action_asset_quota_classification_invalid') END;
END;
--> statement-breakpoint
CREATE TRIGGER `agent_action_assets_quota_classify_after`
AFTER UPDATE OF `quota_classified_at` ON `agent_action_assets`
FOR EACH ROW
WHEN OLD.`quota_classified_at` IS NULL AND NEW.`quota_classified_at` IS NOT NULL
BEGIN
  UPDATE `organization_file_usage`
  SET `temporary_bytes` = `temporary_bytes` - NEW.`size_bytes`,
      `updated_at` = NEW.`quota_classified_at`
  WHERE `organization_id` = NEW.`organization_id`
    AND `temporary_bytes` >= NEW.`size_bytes`;
  SELECT CASE WHEN changes() != 1
    THEN RAISE(ABORT, 'agent_action_asset_quota_decrement_failed') END;
END;
--> statement-breakpoint
CREATE TRIGGER `storage_objects_before_delete_clear_agent_action_assets`
BEFORE DELETE ON `storage_objects`
FOR EACH ROW
BEGIN
  UPDATE `agent_action_assets`
  SET `storage_object_id` = NULL
  WHERE `organization_id` = OLD.`organization_id`
    AND `storage_object_id` = OLD.`id`
    AND `released_at` IS NOT NULL;
END;
--> statement-breakpoint
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
END;
--> statement-breakpoint
CREATE TRIGGER `agent_resource_usage_operations_immutable`
BEFORE UPDATE ON `agent_resource_usage_operations`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'agent_resource_usage_operation_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `agent_session_contexts_rotation_guard`
BEFORE UPDATE ON `agent_session_contexts`
FOR EACH ROW
WHEN NEW.`session_id` IS NOT OLD.`session_id`
  OR NEW.`user_id` IS NOT OLD.`user_id`
  OR NEW.`context_epoch` NOT IN (OLD.`context_epoch`, OLD.`context_epoch` + 1)
  OR NEW.`updated_at` < OLD.`updated_at`
BEGIN
  SELECT RAISE(ABORT, 'agent_context_invalid_rotation');
END;
--> statement-breakpoint
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
END;
--> statement-breakpoint
CREATE TRIGGER `session_agent_context_rotate_organization`
AFTER UPDATE OF `active_organization_id` ON `session`
FOR EACH ROW
WHEN NEW.`active_organization_id` IS NOT OLD.`active_organization_id`
BEGIN
  UPDATE `agent_session_contexts`
  SET `context_epoch` = `context_epoch` + 1,
      `updated_at` = NEW.`updated_at`
  WHERE `session_id` = NEW.`id`
    AND `user_id` = NEW.`user_id`;
  SELECT CASE WHEN changes() != 1
    THEN RAISE(ABORT, 'agent_context_rotation_missing') END;
END;
--> statement-breakpoint
CREATE TRIGGER `storage_objects_identity_immutable`
BEFORE UPDATE ON `storage_objects`
FOR EACH ROW
WHEN NEW.`id` IS NOT OLD.`id`
  OR NEW.`organization_id` IS NOT OLD.`organization_id`
  OR NEW.`uploader_id` IS NOT OLD.`uploader_id`
  OR NEW.`upload_id` IS NOT OLD.`upload_id`
  OR (
    OLD.`status` IN ('ready', 'deleting', 'deleted')
    AND (
      NEW.`size_bytes` IS NOT OLD.`size_bytes`
      OR NEW.`declared_content_type` IS NOT OLD.`declared_content_type`
      OR NEW.`detected_image_format` IS NOT OLD.`detected_image_format`
      OR NEW.`image_width` IS NOT OLD.`image_width`
      OR NEW.`image_height` IS NOT OLD.`image_height`
      OR NEW.`etag` IS NOT OLD.`etag`
      OR NEW.`key_version` IS NOT OLD.`key_version`
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'storage_object_physical_metadata_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `agent_assets_initial_state_insert`
BEFORE INSERT ON `agent_assets`
FOR EACH ROW
WHEN NEW.`status` != 'pending'
  OR NEW.`promoted_file_id` IS NOT NULL
  OR NOT EXISTS (
    SELECT 1 FROM `storage_objects`
    WHERE `organization_id` = NEW.`organization_id`
      AND `id` = NEW.`storage_object_id`
      AND `uploader_id` = NEW.`uploader_id`
      AND `status` IN ('pending', 'ready')
  )
BEGIN
  SELECT RAISE(ABORT, 'agent_asset_invalid_initial_state');
END;
--> statement-breakpoint
CREATE TRIGGER `agent_assets_immutable_update`
BEFORE UPDATE ON `agent_assets`
FOR EACH ROW
WHEN NEW.`id` IS NOT OLD.`id`
  OR NEW.`organization_id` IS NOT OLD.`organization_id`
  OR NEW.`thread_id` IS NOT OLD.`thread_id`
  OR NEW.`context_epoch` IS NOT OLD.`context_epoch`
  OR NEW.`uploader_id` IS NOT OLD.`uploader_id`
  OR NEW.`filename` IS NOT OLD.`filename`
  OR (
    NEW.`expires_at` IS NOT OLD.`expires_at`
    AND NOT (
      OLD.`status` = 'pending'
      AND NEW.`status` = 'ready'
      AND NEW.`expires_at` > OLD.`expires_at`
    )
  )
  OR NEW.`created_at` IS NOT OLD.`created_at`
  OR NEW.`updated_at` < OLD.`updated_at`
BEGIN
  SELECT RAISE(ABORT, 'agent_asset_immutable_field');
END;
--> statement-breakpoint
CREATE TRIGGER `agent_assets_state_machine_update`
BEFORE UPDATE OF `status`, `storage_object_id`, `promoted_file_id` ON `agent_assets`
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT (
    (
      NEW.`status` = OLD.`status`
      AND NEW.`storage_object_id` IS OLD.`storage_object_id`
      AND NEW.`promoted_file_id` IS OLD.`promoted_file_id`
    )
    OR (
      OLD.`status` = 'pending'
      AND NEW.`status` = 'ready'
      AND NEW.`storage_object_id` IS OLD.`storage_object_id`
      AND NEW.`promoted_file_id` IS NULL
      AND EXISTS (
        SELECT 1
        FROM `storage_objects` so
        JOIN `storage_object_claims` c
          ON c.`organization_id` = so.`organization_id`
          AND c.`storage_object_id` = so.`id`
          AND c.`holder_type` = 'agent_asset'
          AND c.`holder_id` = NEW.`id`
        WHERE so.`organization_id` = NEW.`organization_id`
          AND so.`id` = NEW.`storage_object_id`
          AND so.`status` = 'ready'
      )
    )
    OR (
      OLD.`status` IN ('pending', 'ready')
      AND NEW.`status` IN ('expired', 'deleted')
      AND NEW.`storage_object_id` IS NULL
      AND NEW.`promoted_file_id` IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM `storage_object_claims`
        WHERE `organization_id` = OLD.`organization_id`
          AND `storage_object_id` = OLD.`storage_object_id`
      )
      AND NOT EXISTS (
        SELECT 1 FROM `agent_action_assets`
        WHERE `organization_id` = OLD.`organization_id`
          AND `asset_id` = OLD.`id`
          AND `released_at` IS NULL
      )
    )
    OR (
      OLD.`status` = 'ready'
      AND NEW.`status` = 'promoting'
      AND NEW.`storage_object_id` = OLD.`storage_object_id`
      AND NEW.`promoted_file_id` IS NULL
      AND EXISTS (
        SELECT 1
        FROM `agent_action_assets` aa
        JOIN `agent_actions` ac
          ON ac.`organization_id` = aa.`organization_id`
          AND ac.`id` = aa.`action_id`
          AND ac.`kind` = 'create_issue'
          AND ac.`status` = 'approved'
        JOIN `files` f
          ON f.`organization_id` = ac.`organization_id`
          AND f.`storage_object_id` = aa.`storage_object_id`
          AND f.`status` = 'pending'
        JOIN `issue_file_owners` o
          ON o.`organization_id` = ac.`organization_id`
          AND o.`file_id` = f.`id`
          AND o.`issue_id` = ac.`target_id`
        WHERE aa.`organization_id` = NEW.`organization_id`
          AND aa.`asset_id` = NEW.`id`
          AND aa.`storage_object_id` = NEW.`storage_object_id`
          AND aa.`released_at` IS NULL
          AND aa.`lease_expires_at` > CAST(unixepoch('subsecond') * 1000 AS INTEGER)
      )
    )
    OR (
      OLD.`status` = 'promoting'
      AND NEW.`status` = 'promoted'
      AND NEW.`storage_object_id` IS NULL
      AND NEW.`promoted_file_id` IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM `agent_action_assets` aa
        JOIN `agent_actions` ac
          ON ac.`organization_id` = aa.`organization_id`
          AND ac.`id` = aa.`action_id`
          AND ac.`kind` = 'create_issue'
          AND ac.`status` = 'approved'
        JOIN `files` f
          ON f.`organization_id` = ac.`organization_id`
          AND f.`id` = NEW.`promoted_file_id`
          AND f.`storage_object_id` = aa.`storage_object_id`
          AND f.`status` = 'pending'
        JOIN `issue_file_owners` o
          ON o.`organization_id` = ac.`organization_id`
          AND o.`file_id` = f.`id`
          AND o.`issue_id` = ac.`target_id`
        JOIN `storage_object_claims` c
          ON c.`organization_id` = ac.`organization_id`
          AND c.`storage_object_id` = aa.`storage_object_id`
          AND c.`holder_type` = 'file'
          AND c.`holder_id` = f.`id`
        WHERE aa.`organization_id` = NEW.`organization_id`
          AND aa.`asset_id` = NEW.`id`
          AND aa.`storage_object_id` = OLD.`storage_object_id`
          AND aa.`released_at` IS NULL
          AND aa.`lease_expires_at` > CAST(unixepoch('subsecond') * 1000 AS INTEGER)
      )
    )
    OR (
      OLD.`status` = 'promoted'
      AND NEW.`status` = 'deleted'
      AND NEW.`storage_object_id` IS NULL
      AND NEW.`promoted_file_id` IS NULL
    )
  ) THEN RAISE(ABORT, 'agent_asset_invalid_state_transition') END;
END;
--> statement-breakpoint
CREATE TRIGGER `storage_object_claims_holder_insert`
BEFORE INSERT ON `storage_object_claims`
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NEW.`revision` != 1 OR NEW.`holder_type` = 'transferring'
    THEN RAISE(ABORT, 'storage_object_claim_invalid_initial_state') END;
  SELECT CASE WHEN NEW.`holder_type` = 'agent_asset' AND NOT EXISTS (
    SELECT 1 FROM `agent_assets`
    WHERE `organization_id` = NEW.`organization_id`
      AND `id` = NEW.`holder_id`
      AND `storage_object_id` = NEW.`storage_object_id`
      AND `status` IN ('pending', 'ready')
  ) THEN RAISE(ABORT, 'storage_object_claim_asset_mismatch') END;
  SELECT CASE WHEN NEW.`holder_type` = 'file' AND NOT EXISTS (
    SELECT 1 FROM `files`
    WHERE `organization_id` = NEW.`organization_id`
      AND `id` = NEW.`holder_id`
      AND `storage_object_id` = NEW.`storage_object_id`
      AND `status` IN ('pending', 'ready')
  ) THEN RAISE(ABORT, 'storage_object_claim_file_mismatch') END;
END;
--> statement-breakpoint
CREATE TRIGGER `storage_object_claims_promotion_update`
BEFORE UPDATE ON `storage_object_claims`
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NEW.`storage_object_id` IS NOT OLD.`storage_object_id`
    OR NEW.`organization_id` IS NOT OLD.`organization_id`
    OR NEW.`revision` != OLD.`revision` + 1
    OR NEW.`created_at` IS NOT OLD.`created_at`
    OR NEW.`updated_at` < OLD.`updated_at`
    THEN RAISE(ABORT, 'storage_object_claim_invalid_revision') END;
  SELECT CASE WHEN NOT (
    (
      OLD.`holder_type` = 'agent_asset'
      AND NEW.`holder_type` = 'transferring'
      AND NEW.`holder_id` IS NULL
      AND NEW.`from_asset_id` = OLD.`holder_id`
      AND NEW.`to_file_id` IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM `agent_assets` a
        JOIN `agent_action_assets` aa
          ON aa.`organization_id` = a.`organization_id`
          AND aa.`asset_id` = a.`id`
          AND aa.`storage_object_id` = OLD.`storage_object_id`
          AND aa.`released_at` IS NULL
        JOIN `agent_actions` ac
          ON ac.`organization_id` = aa.`organization_id`
          AND ac.`id` = aa.`action_id`
          AND ac.`status` = 'approved'
          AND ac.`kind` = 'create_issue'
        JOIN `files` f
          ON f.`organization_id` = ac.`organization_id`
          AND f.`id` = NEW.`to_file_id`
          AND f.`storage_object_id` = OLD.`storage_object_id`
          AND f.`status` = 'pending'
        JOIN `issue_file_owners` o
          ON o.`organization_id` = ac.`organization_id`
          AND o.`file_id` = f.`id`
          AND o.`issue_id` = ac.`target_id`
        WHERE a.`organization_id` = OLD.`organization_id`
          AND a.`id` = OLD.`holder_id`
          AND a.`status` = 'promoting'
      )
    )
    OR (
      OLD.`holder_type` = 'transferring'
      AND NEW.`holder_type` = 'file'
      AND NEW.`holder_id` = OLD.`to_file_id`
      AND NEW.`from_asset_id` IS NULL
      AND NEW.`to_file_id` IS NULL
      AND EXISTS (
        SELECT 1
        FROM `agent_assets` a
        JOIN `agent_action_assets` aa
          ON aa.`organization_id` = a.`organization_id`
          AND aa.`asset_id` = a.`id`
          AND aa.`storage_object_id` = OLD.`storage_object_id`
          AND aa.`released_at` IS NULL
        JOIN `agent_actions` ac
          ON ac.`organization_id` = aa.`organization_id`
          AND ac.`id` = aa.`action_id`
          AND ac.`status` = 'approved'
          AND ac.`kind` = 'create_issue'
        JOIN `files` f
          ON f.`organization_id` = ac.`organization_id`
          AND f.`id` = OLD.`to_file_id`
          AND f.`storage_object_id` = OLD.`storage_object_id`
          AND f.`status` = 'pending'
        JOIN `issue_file_owners` o
          ON o.`organization_id` = ac.`organization_id`
          AND o.`file_id` = f.`id`
          AND o.`issue_id` = ac.`target_id`
        WHERE a.`organization_id` = OLD.`organization_id`
          AND a.`id` = OLD.`from_asset_id`
          AND a.`status` = 'promoting'
      )
    )
  ) THEN RAISE(ABORT, 'storage_object_claim_invalid_promotion_transition') END;
END;
--> statement-breakpoint
CREATE TRIGGER `files_v2_initial_state_insert`
BEFORE INSERT ON `files`
FOR EACH ROW
WHEN NEW.`storage_object_id` IS NOT NULL
  AND (
    NEW.`status` != 'pending'
    OR NOT EXISTS (
      SELECT 1 FROM `storage_objects`
      WHERE `organization_id` = NEW.`organization_id`
        AND `id` = NEW.`storage_object_id`
        AND `status` = 'ready'
        AND `object_key` = NEW.`object_key`
        AND `size_bytes` = NEW.`size_bytes`
        AND `declared_content_type` = NEW.`declared_content_type`
        AND `detected_image_format` IS NEW.`detected_image_format`
        AND `image_width` IS NEW.`image_width`
        AND `image_height` IS NEW.`image_height`
        AND `etag` IS NEW.`etag`
        AND `key_version` = NEW.`key_version`
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'file_v2_invalid_initial_state');
END;
--> statement-breakpoint
CREATE TRIGGER `files_ready_physical_immutable`
BEFORE UPDATE ON `files`
FOR EACH ROW
WHEN OLD.`status` = 'ready'
  AND (
    NEW.`organization_id` IS NOT OLD.`organization_id`
    OR NEW.`uploader_id` IS NOT OLD.`uploader_id`
    OR NEW.`upload_id` IS NOT OLD.`upload_id`
    OR NEW.`owner_type` IS NOT OLD.`owner_type`
    OR NEW.`object_key` IS NOT OLD.`object_key`
    OR NEW.`filename` IS NOT OLD.`filename`
    OR NEW.`size_bytes` IS NOT OLD.`size_bytes`
    OR NEW.`declared_content_type` IS NOT OLD.`declared_content_type`
    OR NEW.`detected_image_format` IS NOT OLD.`detected_image_format`
    OR NEW.`image_width` IS NOT OLD.`image_width`
    OR NEW.`image_height` IS NOT OLD.`image_height`
    OR NEW.`etag` IS NOT OLD.`etag`
    OR NEW.`storage_object_id` IS NOT OLD.`storage_object_id`
    OR NEW.`key_version` IS NOT OLD.`key_version`
    OR NEW.`created_at` IS NOT OLD.`created_at`
  )
BEGIN
  SELECT RAISE(ABORT, 'file_ready_physical_metadata_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `files_v2_ready_update`
BEFORE UPDATE OF `status` ON `files`
FOR EACH ROW
WHEN NEW.`storage_object_id` IS NOT NULL
  AND NEW.`status` = 'ready'
  AND OLD.`status` != 'ready'
  AND NOT EXISTS (
    SELECT 1
    FROM `storage_objects` so
    JOIN `storage_object_claims` c
      ON c.`organization_id` = so.`organization_id`
      AND c.`storage_object_id` = so.`id`
      AND c.`holder_type` = 'file'
      AND c.`holder_id` = NEW.`id`
    WHERE so.`organization_id` = NEW.`organization_id`
      AND so.`id` = NEW.`storage_object_id`
      AND so.`status` = 'ready'
      AND so.`object_key` = NEW.`object_key`
      AND so.`size_bytes` = NEW.`size_bytes`
      AND so.`declared_content_type` = NEW.`declared_content_type`
      AND so.`detected_image_format` IS NEW.`detected_image_format`
      AND so.`image_width` IS NEW.`image_width`
      AND so.`image_height` IS NEW.`image_height`
      AND so.`etag` IS NEW.`etag`
      AND so.`key_version` = NEW.`key_version`
      AND (
        NOT EXISTS (
          SELECT 1 FROM `agent_assets`
          WHERE `organization_id` = NEW.`organization_id`
            AND `promoted_file_id` = NEW.`id`
        )
        OR EXISTS (
          SELECT 1
          FROM `agent_assets` a
          JOIN `agent_action_assets` aa
            ON aa.`organization_id` = a.`organization_id`
            AND aa.`asset_id` = a.`id`
            AND aa.`storage_object_id` = NEW.`storage_object_id`
            AND aa.`released_at` IS NULL
          JOIN `agent_actions` ac
            ON ac.`organization_id` = aa.`organization_id`
            AND ac.`id` = aa.`action_id`
            AND ac.`status` = 'approved'
          WHERE a.`organization_id` = NEW.`organization_id`
            AND a.`promoted_file_id` = NEW.`id`
            AND a.`status` = 'promoted'
        )
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'file_v2_ready_claim_or_snapshot_mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `files_before_delete_detach_promoted_asset`
BEFORE DELETE ON `files`
FOR EACH ROW
BEGIN
  UPDATE `agent_assets`
  SET `status` = 'deleted',
      `promoted_file_id` = NULL,
      `updated_at` = max(
        `updated_at`,
        CAST(unixepoch('subsecond') * 1000 AS INTEGER)
      )
  WHERE `organization_id` = OLD.`organization_id`
    AND `promoted_file_id` = OLD.`id`
    AND `status` = 'promoted';
  DELETE FROM `storage_object_claims`
  WHERE `organization_id` = OLD.`organization_id`
    AND `holder_type` = 'file'
    AND `holder_id` = OLD.`id`;
END;
