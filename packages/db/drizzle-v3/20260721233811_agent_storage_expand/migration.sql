CREATE TABLE `agent_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`session_id` text,
	`context_epoch` integer NOT NULL,
	`uploader_id` text NOT NULL,
	`storage_object_id` text,
	`filename` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`promoted_file_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`uploader_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`,`thread_id`) REFERENCES `agent_threads`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`storage_object_id`) REFERENCES `storage_objects`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`promoted_file_id`) REFERENCES `files`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agent_assets_epoch_check" CHECK("agent_assets"."context_epoch" >= 1),
	CONSTRAINT "agent_assets_session_id_check" CHECK("agent_assets"."session_id" is null or length("agent_assets"."session_id") between 1 and 128),
	CONSTRAINT "agent_assets_filename_check" CHECK(length("agent_assets"."filename") between 1 and 255),
	CONSTRAINT "agent_assets_status_check" CHECK("agent_assets"."status" in ('pending', 'ready', 'promoting', 'promoted', 'expired', 'deleted')),
	CONSTRAINT "agent_assets_state_shape_check" CHECK((
        "agent_assets"."status" in ('pending', 'ready', 'promoting')
        and "agent_assets"."storage_object_id" is not null
        and "agent_assets"."promoted_file_id" is null
      ) or (
        "agent_assets"."status" = 'promoted'
        and "agent_assets"."storage_object_id" is null
        and "agent_assets"."promoted_file_id" is not null
      ) or (
        "agent_assets"."status" in ('expired', 'deleted')
        and "agent_assets"."storage_object_id" is null
        and "agent_assets"."promoted_file_id" is null
      )),
	CONSTRAINT "agent_assets_expiry_check" CHECK("agent_assets"."expires_at" > "agent_assets"."created_at"
        and "agent_assets"."expires_at" <= "agent_assets"."created_at" + 604800000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_assets_organization_id_uidx` ON `agent_assets` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_assets_storage_object_uidx` ON `agent_assets` (`storage_object_id`) WHERE "agent_assets"."storage_object_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_assets_promoted_file_uidx` ON `agent_assets` (`promoted_file_id`) WHERE "agent_assets"."promoted_file_id" is not null;--> statement-breakpoint
CREATE INDEX `agent_assets_thread_status_expiry_idx` ON `agent_assets` (`organization_id`,`thread_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `agent_assets_cleanup_idx` ON `agent_assets` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `agent_run_assets` (
	`organization_id` text NOT NULL,
	`run_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`storage_object_id` text,
	`source_etag` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`run_id`, `asset_id`),
	FOREIGN KEY (`organization_id`,`run_id`) REFERENCES `agent_runs`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`asset_id`) REFERENCES `agent_assets`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`storage_object_id`) REFERENCES `storage_objects`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agent_run_assets_source_etag_check" CHECK(length("agent_run_assets"."source_etag") between 1 and 128),
	CONSTRAINT "agent_run_assets_size_bytes_check" CHECK("agent_run_assets"."size_bytes" between 0 and 10000000)
);
--> statement-breakpoint
CREATE INDEX `agent_run_assets_organization_run_idx` ON `agent_run_assets` (`organization_id`,`run_id`);--> statement-breakpoint
CREATE INDEX `agent_run_assets_storage_object_idx` ON `agent_run_assets` (`storage_object_id`);--> statement-breakpoint
CREATE TABLE `storage_object_claims` (
	`storage_object_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`holder_type` text NOT NULL,
	`holder_id` text,
	`from_asset_id` text,
	`to_file_id` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`,`storage_object_id`) REFERENCES `storage_objects`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "storage_object_claims_holder_type_check" CHECK("storage_object_claims"."holder_type" in ('agent_asset', 'transferring', 'file')),
	CONSTRAINT "storage_object_claims_shape_check" CHECK((
        "storage_object_claims"."holder_type" in ('agent_asset', 'file')
        and "storage_object_claims"."holder_id" is not null
        and length("storage_object_claims"."holder_id") between 1 and 128
        and "storage_object_claims"."from_asset_id" is null
        and "storage_object_claims"."to_file_id" is null
      ) or (
        "storage_object_claims"."holder_type" = 'transferring'
        and "storage_object_claims"."holder_id" is null
        and "storage_object_claims"."from_asset_id" is not null
        and length("storage_object_claims"."from_asset_id") between 1 and 128
        and "storage_object_claims"."to_file_id" is not null
        and length("storage_object_claims"."to_file_id") between 1 and 128
      )),
	CONSTRAINT "storage_object_claims_revision_check" CHECK("storage_object_claims"."revision" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `storage_object_claims_holder_uidx` ON `storage_object_claims` (`organization_id`,`holder_type`,`holder_id`) WHERE "storage_object_claims"."holder_type" in ('agent_asset', 'file');--> statement-breakpoint
CREATE UNIQUE INDEX `storage_object_claims_transfer_from_uidx` ON `storage_object_claims` (`organization_id`,`from_asset_id`) WHERE "storage_object_claims"."holder_type" = 'transferring';--> statement-breakpoint
CREATE UNIQUE INDEX `storage_object_claims_transfer_to_uidx` ON `storage_object_claims` (`organization_id`,`to_file_id`) WHERE "storage_object_claims"."holder_type" = 'transferring';--> statement-breakpoint
CREATE INDEX `storage_object_claims_organization_holder_idx` ON `storage_object_claims` (`organization_id`,`holder_type`,`holder_id`);--> statement-breakpoint
CREATE TABLE `storage_object_cleanup_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`storage_object_id` text NOT NULL,
	`expected_cleanup_revision` integer NOT NULL,
	`object_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`lease_token` text,
	`locked_at` integer,
	`lease_expires_at` integer,
	`next_attempt_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`completed_at` integer,
	CONSTRAINT "storage_object_cleanup_jobs_revision_check" CHECK("storage_object_cleanup_jobs"."expected_cleanup_revision" >= 1),
	CONSTRAINT "storage_object_cleanup_jobs_object_key_check" CHECK(length("storage_object_cleanup_jobs"."object_key") between 1 and 1024),
	CONSTRAINT "storage_object_cleanup_jobs_status_check" CHECK("storage_object_cleanup_jobs"."status" in ('pending', 'processing', 'failed', 'completed')),
	CONSTRAINT "storage_object_cleanup_jobs_attempts_check" CHECK("storage_object_cleanup_jobs"."attempts" >= 0),
	CONSTRAINT "storage_object_cleanup_jobs_last_error_code_check" CHECK("storage_object_cleanup_jobs"."last_error_code" is null or (
        length("storage_object_cleanup_jobs"."last_error_code") between 1 and 96
        and "storage_object_cleanup_jobs"."last_error_code" glob '[A-Za-z]*'
        and "storage_object_cleanup_jobs"."last_error_code" not glob '*[^A-Za-z0-9_.:-]*'
      )),
	CONSTRAINT "storage_object_cleanup_jobs_lease_check" CHECK((
        "storage_object_cleanup_jobs"."status" = 'processing'
        and "storage_object_cleanup_jobs"."lease_token" is not null
        and length("storage_object_cleanup_jobs"."lease_token") = 64
        and "storage_object_cleanup_jobs"."lease_token" not glob '*[^0-9a-f]*'
        and "storage_object_cleanup_jobs"."locked_at" is not null
        and "storage_object_cleanup_jobs"."lease_expires_at" is not null
        and "storage_object_cleanup_jobs"."lease_expires_at" > "storage_object_cleanup_jobs"."locked_at"
      ) or (
        "storage_object_cleanup_jobs"."status" != 'processing'
        and "storage_object_cleanup_jobs"."lease_token" is null
        and "storage_object_cleanup_jobs"."locked_at" is null
        and "storage_object_cleanup_jobs"."lease_expires_at" is null
      )),
	CONSTRAINT "storage_object_cleanup_jobs_completed_at_check" CHECK((
        "storage_object_cleanup_jobs"."status" = 'completed'
        and "storage_object_cleanup_jobs"."completed_at" is not null
      ) or (
        "storage_object_cleanup_jobs"."status" != 'completed'
        and "storage_object_cleanup_jobs"."completed_at" is null
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `storage_object_cleanup_jobs_revision_uidx` ON `storage_object_cleanup_jobs` (`storage_object_id`,`expected_cleanup_revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `storage_object_cleanup_jobs_object_key_uidx` ON `storage_object_cleanup_jobs` (`object_key`);--> statement-breakpoint
CREATE INDEX `storage_object_cleanup_jobs_organization_idx` ON `storage_object_cleanup_jobs` (`organization_id`);--> statement-breakpoint
CREATE INDEX `storage_object_cleanup_jobs_claim_idx` ON `storage_object_cleanup_jobs` (`status`,`next_attempt_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `storage_objects` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`uploader_id` text NOT NULL,
	`upload_id` text NOT NULL,
	`object_key` text,
	`size_bytes` integer NOT NULL,
	`declared_content_type` text NOT NULL,
	`detected_image_format` text,
	`image_width` integer,
	`image_height` integer,
	`etag` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`key_version` integer DEFAULT 2 NOT NULL,
	`cleanup_revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploader_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "storage_objects_upload_id_check" CHECK(length("storage_objects"."upload_id") between 1 and 128),
	CONSTRAINT "storage_objects_size_bytes_check" CHECK("storage_objects"."size_bytes" between 0 and 20000000),
	CONSTRAINT "storage_objects_declared_content_type_check" CHECK(length("storage_objects"."declared_content_type") <= 255),
	CONSTRAINT "storage_objects_detected_image_format_check" CHECK("storage_objects"."detected_image_format" is null or "storage_objects"."detected_image_format" in ('jpeg', 'png', 'webp', 'gif', 'avif')),
	CONSTRAINT "storage_objects_image_dimensions_check" CHECK((
        "storage_objects"."image_width" is null and "storage_objects"."image_height" is null
      ) or (
        "storage_objects"."image_width" is not null
        and "storage_objects"."image_height" is not null
        and "storage_objects"."image_width" > 0
        and "storage_objects"."image_height" > 0
      )),
	CONSTRAINT "storage_objects_status_check" CHECK("storage_objects"."status" in ('pending', 'ready', 'deleting', 'deleted')),
	CONSTRAINT "storage_objects_object_key_check" CHECK((
        "storage_objects"."status" = 'deleted'
        and "storage_objects"."object_key" is null
      ) or (
        "storage_objects"."status" != 'deleted'
        and "storage_objects"."object_key" is not null
        and length("storage_objects"."object_key") between 1 and 1024
      )),
	CONSTRAINT "storage_objects_ready_etag_check" CHECK("storage_objects"."status" != 'ready' or (
        "storage_objects"."etag" is not null
        and length("storage_objects"."etag") between 1 and 128
      )),
	CONSTRAINT "storage_objects_key_version_check" CHECK("storage_objects"."key_version" in (1, 2)),
	CONSTRAINT "storage_objects_cleanup_revision_check" CHECK("storage_objects"."cleanup_revision" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `storage_objects_organization_id_uidx` ON `storage_objects` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `storage_objects_organization_upload_uidx` ON `storage_objects` (`organization_id`,`upload_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `storage_objects_object_key_uidx` ON `storage_objects` (`object_key`) WHERE "storage_objects"."object_key" is not null;--> statement-breakpoint
CREATE INDEX `storage_objects_organization_status_created_idx` ON `storage_objects` (`organization_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `storage_objects_cleanup_idx` ON `storage_objects` (`status`,`cleanup_revision`,`updated_at`);--> statement-breakpoint
CREATE INDEX `storage_objects_uploader_idx` ON `storage_objects` (`organization_id`,`uploader_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_files` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`uploader_id` text NOT NULL,
	`upload_id` text NOT NULL,
	`owner_type` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`declared_content_type` text NOT NULL,
	`detected_image_format` text,
	`image_width` integer,
	`image_height` integer,
	`etag` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`storage_object_id` text,
	`key_version` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploader_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`,`storage_object_id`) REFERENCES `storage_objects`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "files_owner_type_check" CHECK("__new_files"."owner_type" in ('issue')),
	CONSTRAINT "files_status_check" CHECK("__new_files"."status" in ('pending', 'ready')),
	CONSTRAINT "files_size_bytes_check" CHECK("__new_files"."size_bytes" between 0 and 20000000),
	CONSTRAINT "files_filename_check" CHECK(length("__new_files"."filename") between 1 and 255),
	CONSTRAINT "files_declared_content_type_check" CHECK(length("__new_files"."declared_content_type") <= 255),
	CONSTRAINT "files_detected_image_format_check" CHECK("__new_files"."detected_image_format" is null or "__new_files"."detected_image_format" in ('jpeg', 'png', 'webp', 'gif', 'avif')),
	CONSTRAINT "files_image_dimensions_check" CHECK((
        "__new_files"."image_width" is null and "__new_files"."image_height" is null
      ) or (
        "__new_files"."image_width" > 0 and "__new_files"."image_height" > 0
      )),
	CONSTRAINT "files_ready_etag_check" CHECK("__new_files"."status" != 'ready' or length("__new_files"."etag") between 1 and 128),
	CONSTRAINT "files_storage_v2_check" CHECK((
        "__new_files"."storage_object_id" is null
        and "__new_files"."key_version" is null
      ) or (
        "__new_files"."storage_object_id" is not null
        and "__new_files"."key_version" is not null
        and "__new_files"."key_version" in (1, 2)
      ))
);
--> statement-breakpoint
INSERT INTO `__new_files`("id", "organization_id", "uploader_id", "upload_id", "owner_type", "object_key", "filename", "size_bytes", "declared_content_type", "detected_image_format", "image_width", "image_height", "etag", "status", "storage_object_id", "key_version", "created_at", "updated_at") SELECT "id", "organization_id", "uploader_id", "upload_id", "owner_type", "object_key", "filename", "size_bytes", "declared_content_type", "detected_image_format", "image_width", "image_height", "etag", "status", NULL, NULL, "created_at", "updated_at" FROM `files`;--> statement-breakpoint
DROP TABLE `files`;--> statement-breakpoint
ALTER TABLE `__new_files` RENAME TO `files`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `files_organization_upload_uidx` ON `files` (`organization_id`,`upload_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `files_object_key_uidx` ON `files` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `files_id_organization_owner_type_uidx` ON `files` (`id`,`organization_id`,`owner_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `files_organization_id_uidx` ON `files` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `files_storage_object_uidx` ON `files` (`storage_object_id`) WHERE "files"."storage_object_id" is not null;--> statement-breakpoint
CREATE INDEX `files_organization_status_created_idx` ON `files` (`organization_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `files_organization_uploader_idx` ON `files` (`organization_id`,`uploader_id`);--> statement-breakpoint
CREATE TABLE `__new_organization_file_usage` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`used_bytes` integer DEFAULT 0 NOT NULL,
	`temporary_bytes` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "organization_file_usage_used_bytes_check" CHECK("__new_organization_file_usage"."used_bytes" between 0 and 1073741824),
	CONSTRAINT "organization_file_usage_temporary_bytes_check" CHECK("__new_organization_file_usage"."temporary_bytes" between 0 and "__new_organization_file_usage"."used_bytes")
);
--> statement-breakpoint
INSERT INTO `__new_organization_file_usage`("organization_id", "used_bytes", "temporary_bytes", "updated_at") SELECT "organization_id", "used_bytes", 0, "updated_at" FROM `organization_file_usage`;--> statement-breakpoint
DROP TABLE `organization_file_usage`;--> statement-breakpoint
ALTER TABLE `__new_organization_file_usage` RENAME TO `organization_file_usage`;--> statement-breakpoint
INSERT INTO `storage_objects` (
	`id`,
	`organization_id`,
	`uploader_id`,
	`upload_id`,
	`object_key`,
	`size_bytes`,
	`declared_content_type`,
	`detected_image_format`,
	`image_width`,
	`image_height`,
	`etag`,
	`status`,
	`key_version`,
	`cleanup_revision`,
	`created_at`,
	`updated_at`
)
SELECT
	`id`,
	`organization_id`,
	`uploader_id`,
	`upload_id`,
	`object_key`,
	`size_bytes`,
	`declared_content_type`,
	`detected_image_format`,
	`image_width`,
	`image_height`,
	`etag`,
	`status`,
	1,
	0,
	`created_at`,
	`updated_at`
FROM `files`;--> statement-breakpoint
UPDATE `files`
SET
	`storage_object_id` = `id`,
	`key_version` = 1
WHERE `storage_object_id` IS NULL;--> statement-breakpoint
INSERT INTO `storage_object_claims` (
	`storage_object_id`,
	`organization_id`,
	`holder_type`,
	`holder_id`,
	`revision`,
	`created_at`,
	`updated_at`
)
SELECT
	`storage_object_id`,
	`organization_id`,
	'file',
	`id`,
	1,
	`created_at`,
	`updated_at`
FROM `files`
WHERE `storage_object_id` IS NOT NULL;--> statement-breakpoint
CREATE TRIGGER `agent_run_assets_insert_limits`
BEFORE INSERT ON `agent_run_assets`
BEGIN
	SELECT CASE
		WHEN (
			SELECT count(*)
			FROM `agent_run_assets`
			WHERE `organization_id` = NEW.`organization_id`
				AND `run_id` = NEW.`run_id`
		) >= 4
		THEN RAISE(ABORT, 'agent_run_assets_count_limit')
	END;
	SELECT CASE
		WHEN coalesce((
			SELECT sum(`size_bytes`)
			FROM `agent_run_assets`
			WHERE `organization_id` = NEW.`organization_id`
				AND `run_id` = NEW.`run_id`
		), 0) + NEW.`size_bytes` > 20000000
		THEN RAISE(ABORT, 'agent_run_assets_bytes_limit')
	END;
END;--> statement-breakpoint
CREATE TRIGGER `agent_run_assets_update_limits`
BEFORE UPDATE OF `organization_id`, `run_id`, `size_bytes` ON `agent_run_assets`
BEGIN
	SELECT CASE
		WHEN (
			SELECT count(*)
			FROM `agent_run_assets`
			WHERE `organization_id` = NEW.`organization_id`
				AND `run_id` = NEW.`run_id`
				AND NOT (
					`run_id` = OLD.`run_id`
					AND `asset_id` = OLD.`asset_id`
				)
		) >= 4
		THEN RAISE(ABORT, 'agent_run_assets_count_limit')
	END;
	SELECT CASE
		WHEN coalesce((
			SELECT sum(`size_bytes`)
			FROM `agent_run_assets`
			WHERE `organization_id` = NEW.`organization_id`
				AND `run_id` = NEW.`run_id`
				AND NOT (
					`run_id` = OLD.`run_id`
					AND `asset_id` = OLD.`asset_id`
				)
		), 0) + NEW.`size_bytes` > 20000000
		THEN RAISE(ABORT, 'agent_run_assets_bytes_limit')
	END;
END;
--> statement-breakpoint
CREATE TRIGGER `storage_objects_before_delete_clear_agent_run_assets`
BEFORE DELETE ON `storage_objects`
BEGIN
	UPDATE `agent_run_assets`
	SET `storage_object_id` = NULL
	WHERE `organization_id` = OLD.`organization_id`
		AND `storage_object_id` = OLD.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `storage_object_claims_insert_live_object`
BEFORE INSERT ON `storage_object_claims`
WHEN NOT EXISTS (
	SELECT 1
	FROM `storage_objects`
	WHERE `id` = NEW.`storage_object_id`
		AND `organization_id` = NEW.`organization_id`
		AND `status` IN ('pending', 'ready')
)
BEGIN
	SELECT RAISE(ABORT, 'storage_object_claim_requires_live_object');
END;
--> statement-breakpoint
CREATE TRIGGER `storage_object_claims_update_live_object`
BEFORE UPDATE OF `storage_object_id`, `organization_id` ON `storage_object_claims`
WHEN NOT EXISTS (
	SELECT 1
	FROM `storage_objects`
	WHERE `id` = NEW.`storage_object_id`
		AND `organization_id` = NEW.`organization_id`
		AND `status` IN ('pending', 'ready')
)
BEGIN
	SELECT RAISE(ABORT, 'storage_object_claim_requires_live_object');
END;
--> statement-breakpoint
CREATE TRIGGER `storage_objects_update_state_machine`
BEFORE UPDATE OF `status`, `cleanup_revision`, `object_key` ON `storage_objects`
WHEN NOT (
	(
		NEW.`status` = OLD.`status`
		AND NEW.`cleanup_revision` = OLD.`cleanup_revision`
		AND NEW.`object_key` IS OLD.`object_key`
	) OR (
		OLD.`status` = 'pending'
		AND NEW.`status` = 'ready'
		AND NEW.`cleanup_revision` = OLD.`cleanup_revision`
		AND NEW.`object_key` IS OLD.`object_key`
	) OR (
		OLD.`status` IN ('pending', 'ready')
		AND NEW.`status` = 'deleting'
		AND NEW.`cleanup_revision` = OLD.`cleanup_revision` + 1
		AND NEW.`object_key` IS OLD.`object_key`
	) OR (
		OLD.`status` = 'deleting'
		AND NEW.`status` = 'deleted'
		AND NEW.`cleanup_revision` = OLD.`cleanup_revision`
		AND OLD.`object_key` IS NOT NULL
		AND NEW.`object_key` IS NULL
	)
)
BEGIN
	SELECT RAISE(ABORT, 'storage_object_invalid_state_transition');
END;
--> statement-breakpoint
CREATE TRIGGER `storage_objects_update_cleanup_without_claim`
BEFORE UPDATE OF `status` ON `storage_objects`
WHEN NEW.`status` IN ('deleting', 'deleted')
	AND EXISTS (
		SELECT 1
		FROM `storage_object_claims`
		WHERE `storage_object_id` = OLD.`id`
			AND `organization_id` = OLD.`organization_id`
	)
BEGIN
	SELECT RAISE(ABORT, 'storage_object_cleanup_requires_no_claim');
END;
--> statement-breakpoint
CREATE TRIGGER `storage_object_cleanup_jobs_insert_fence`
BEFORE INSERT ON `storage_object_cleanup_jobs`
WHEN NOT EXISTS (
	SELECT 1
	FROM `storage_objects`
	WHERE `id` = NEW.`storage_object_id`
		AND `organization_id` = NEW.`organization_id`
		AND `status` = 'deleting'
		AND `cleanup_revision` = NEW.`expected_cleanup_revision`
		AND `object_key` = NEW.`object_key`
		AND NOT EXISTS (
			SELECT 1
			FROM `storage_object_claims`
			WHERE `storage_object_id` = NEW.`storage_object_id`
				AND `organization_id` = NEW.`organization_id`
		)
)
BEGIN
	SELECT RAISE(ABORT, 'storage_object_cleanup_job_fence_mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `storage_object_cleanup_jobs_update_fence_immutable`
BEFORE UPDATE OF `organization_id`, `storage_object_id`, `expected_cleanup_revision`, `object_key`
ON `storage_object_cleanup_jobs`
WHEN NEW.`organization_id` IS NOT OLD.`organization_id`
	OR NEW.`storage_object_id` IS NOT OLD.`storage_object_id`
	OR NEW.`expected_cleanup_revision` IS NOT OLD.`expected_cleanup_revision`
	OR NEW.`object_key` IS NOT OLD.`object_key`
BEGIN
	SELECT RAISE(ABORT, 'storage_object_cleanup_job_fence_immutable');
END;
