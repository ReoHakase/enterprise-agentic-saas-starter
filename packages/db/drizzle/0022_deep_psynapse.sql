DROP TABLE `agent_messages`;--> statement-breakpoint
DROP TABLE `agent_thread_context_summaries`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `agent_approval_policies_scope_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `agent_actions_scope_insert`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_threads_status_check" CHECK("__new_agent_threads"."status" in ('active', 'archived')),
	CONSTRAINT "agent_threads_archive_check" CHECK(("__new_agent_threads"."status" = 'active' and "__new_agent_threads"."archived_at" is null)
        or ("__new_agent_threads"."status" = 'archived' and "__new_agent_threads"."archived_at" is not null))
);
--> statement-breakpoint
INSERT INTO `__new_agent_threads`("id", "organization_id", "owner_user_id", "status", "created_at", "archived_at")
SELECT "id", "organization_id", "owner_user_id", "status", "created_at",
	CASE WHEN "status" = 'archived' THEN "updated_at" ELSE NULL END
FROM `agent_threads`;--> statement-breakpoint
DROP TABLE `agent_threads`;--> statement-breakpoint
ALTER TABLE `__new_agent_threads` RENAME TO `agent_threads`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_threads_organization_id_uidx` ON `agent_threads` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `agent_threads_owner_status_created_idx` ON `agent_threads` (`organization_id`,`owner_user_id`,`status`,`created_at`);--> statement-breakpoint
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
END;--> statement-breakpoint
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
