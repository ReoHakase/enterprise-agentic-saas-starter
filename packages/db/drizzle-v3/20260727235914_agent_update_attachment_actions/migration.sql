DROP TRIGGER `agent_action_assets_scope_insert`;
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
      AND (
        ac.`kind` = 'create_issue'
        OR (
          ac.`kind` = 'update_issue'
          AND json_extract(ac.`normalized_payload`, '$.operation') = 'add_attachments'
        )
      )
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
DROP TRIGGER `agent_action_assets_quota_classify_before`;
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
      AND (
        ac.`kind` = 'create_issue'
        OR (
          ac.`kind` = 'update_issue'
          AND json_extract(ac.`normalized_payload`, '$.operation') = 'add_attachments'
        )
      )
      AND ac.`status` = 'approved'
      AND NEW.`released_at` IS NULL
      AND NEW.`lease_expires_at` >= NEW.`quota_classified_at`
  ) THEN RAISE(ABORT, 'agent_action_asset_quota_classification_invalid') END;
END;
--> statement-breakpoint
DROP TRIGGER `agent_assets_state_machine_update`;
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
          AND ac.`status` = 'approved'
          AND (
            ac.`kind` = 'create_issue'
            OR (
              ac.`kind` = 'update_issue'
              AND json_extract(ac.`normalized_payload`, '$.operation') = 'add_attachments'
            )
          )
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
          AND ac.`status` = 'approved'
          AND (
            ac.`kind` = 'create_issue'
            OR (
              ac.`kind` = 'update_issue'
              AND json_extract(ac.`normalized_payload`, '$.operation') = 'add_attachments'
            )
          )
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
DROP TRIGGER `storage_object_claims_promotion_update`;
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
          AND (
            ac.`kind` = 'create_issue'
            OR (
              ac.`kind` = 'update_issue'
              AND json_extract(ac.`normalized_payload`, '$.operation') = 'add_attachments'
            )
          )
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
          AND (
            ac.`kind` = 'create_issue'
            OR (
              ac.`kind` = 'update_issue'
              AND json_extract(ac.`normalized_payload`, '$.operation') = 'add_attachments'
            )
          )
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
CREATE TRIGGER `agent_update_attachment_success_integrity`
BEFORE UPDATE OF `status` ON `agent_actions`
FOR EACH ROW
WHEN NEW.`status` = 'succeeded'
  AND NEW.`kind` = 'update_issue'
BEGIN
  SELECT CASE WHEN coalesce(
    json_extract(NEW.`normalized_payload`, '$.operation'),
    'fields'
  ) NOT IN ('fields', 'add_attachments', 'remove_attachments')
    THEN RAISE(ABORT, 'agent_action_update_operation_invalid') END;
  SELECT CASE WHEN
    json_extract(NEW.`normalized_payload`, '$.operation') = 'add_attachments'
    AND (
      NEW.`completed_at` IS NULL
      OR coalesce(
        json_type(NEW.`normalized_payload`, '$.attachments'),
        ''
      ) != 'array'
      OR coalesce(
        json_array_length(NEW.`normalized_payload`, '$.attachments'),
        0
      ) NOT BETWEEN 1 AND 4
      OR EXISTS (
        SELECT 1
        FROM json_each(NEW.`normalized_payload`, '$.attachments') p
        WHERE json_type(p.`value`) != 'object'
          OR coalesce(json_type(p.`value`, '$.assetId'), '') != 'text'
          OR coalesce(json_type(p.`value`, '$.fileId'), '') != 'text'
          OR length(json_extract(p.`value`, '$.assetId')) = 0
          OR length(json_extract(p.`value`, '$.fileId')) = 0
      )
      OR coalesce(
        json_array_length(NEW.`normalized_payload`, '$.attachments'),
        0
      ) != (
        SELECT count(*) FROM `agent_action_assets`
        WHERE `organization_id` = NEW.`organization_id`
          AND `action_id` = NEW.`id`
      )
      OR coalesce(
        json_array_length(NEW.`normalized_payload`, '$.attachments'),
        0
      ) != (
        SELECT count(DISTINCT json_extract(p.`value`, '$.assetId'))
        FROM json_each(NEW.`normalized_payload`, '$.attachments') p
      )
      OR coalesce(
        json_array_length(NEW.`normalized_payload`, '$.attachments'),
        0
      ) != (
        SELECT count(DISTINCT json_extract(p.`value`, '$.fileId'))
        FROM json_each(NEW.`normalized_payload`, '$.attachments') p
      )
    )
    THEN RAISE(ABORT, 'agent_action_attachment_payload_mismatch') END;
  SELECT CASE WHEN
    json_extract(NEW.`normalized_payload`, '$.operation') = 'add_attachments'
    AND EXISTS (
    SELECT 1
    FROM json_each(NEW.`normalized_payload`, '$.attachments') p
    LEFT JOIN `agent_action_assets` aa
      ON aa.`organization_id` = NEW.`organization_id`
      AND aa.`action_id` = NEW.`id`
      AND aa.`asset_id` = json_extract(p.`value`, '$.assetId')
    LEFT JOIN `agent_assets` a
      ON a.`organization_id` = aa.`organization_id`
      AND a.`id` = aa.`asset_id`
    LEFT JOIN `files` f
      ON f.`organization_id` = aa.`organization_id`
      AND f.`id` = json_extract(p.`value`, '$.fileId')
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
    WHERE aa.`asset_id` IS NULL
      OR aa.`released_at` IS NOT NULL
      OR aa.`quota_classified_at` IS NULL
      OR aa.`lease_expires_at` < NEW.`completed_at`
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
    THEN RAISE(ABORT, 'agent_action_attachment_promotion_incomplete') END;
  SELECT CASE WHEN
    json_extract(NEW.`normalized_payload`, '$.operation')
      IN ('fields', 'remove_attachments')
    AND EXISTS (
      SELECT 1 FROM `agent_action_assets`
      WHERE `organization_id` = NEW.`organization_id`
        AND `action_id` = NEW.`id`
    )
    THEN RAISE(ABORT, 'agent_action_update_assets_unexpected') END;
END;
