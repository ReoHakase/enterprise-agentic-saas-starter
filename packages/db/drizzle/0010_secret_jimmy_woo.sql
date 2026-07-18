CREATE TABLE `file_cleanup_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`kind` text NOT NULL,
	`object_key` text,
	`prefix` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`locked_at` integer,
	`next_attempt_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`completed_at` integer,
	CONSTRAINT "file_cleanup_jobs_kind_check" CHECK("file_cleanup_jobs"."kind" in ('exact', 'owner_prefix')),
	CONSTRAINT "file_cleanup_jobs_target_check" CHECK((
        "file_cleanup_jobs"."kind" = 'exact'
        and length("file_cleanup_jobs"."object_key") between 1 and 1024
        and "file_cleanup_jobs"."prefix" is null
      ) or (
        "file_cleanup_jobs"."kind" = 'owner_prefix'
        and "file_cleanup_jobs"."object_key" is null
        and length("file_cleanup_jobs"."prefix") between 1 and 1024
      )),
	CONSTRAINT "file_cleanup_jobs_status_check" CHECK("file_cleanup_jobs"."status" in ('pending', 'processing', 'failed', 'completed')),
	CONSTRAINT "file_cleanup_jobs_attempts_check" CHECK("file_cleanup_jobs"."attempts" >= 0),
	CONSTRAINT "file_cleanup_jobs_last_error_code_check" CHECK("file_cleanup_jobs"."last_error_code" is null or (
        length("file_cleanup_jobs"."last_error_code") between 1 and 96
        and "file_cleanup_jobs"."last_error_code" glob '[A-Za-z]*'
        and "file_cleanup_jobs"."last_error_code" not glob '*[^A-Za-z0-9_.:-]*'
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_cleanup_jobs_object_key_uidx` ON `file_cleanup_jobs` (`object_key`) WHERE "file_cleanup_jobs"."kind" = 'exact';--> statement-breakpoint
CREATE UNIQUE INDEX `file_cleanup_jobs_prefix_uidx` ON `file_cleanup_jobs` (`prefix`) WHERE "file_cleanup_jobs"."kind" = 'owner_prefix';--> statement-breakpoint
CREATE INDEX `file_cleanup_jobs_organization_idx` ON `file_cleanup_jobs` (`organization_id`);--> statement-breakpoint
CREATE INDEX `file_cleanup_jobs_claim_idx` ON `file_cleanup_jobs` (`status`,`next_attempt_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `files` (
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
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploader_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "files_owner_type_check" CHECK("files"."owner_type" in ('issue')),
	CONSTRAINT "files_status_check" CHECK("files"."status" in ('pending', 'ready')),
	CONSTRAINT "files_size_bytes_check" CHECK("files"."size_bytes" between 0 and 20000000),
	CONSTRAINT "files_filename_check" CHECK(length("files"."filename") between 1 and 255),
	CONSTRAINT "files_declared_content_type_check" CHECK(length("files"."declared_content_type") <= 255),
	CONSTRAINT "files_detected_image_format_check" CHECK("files"."detected_image_format" is null or "files"."detected_image_format" in ('jpeg', 'png', 'webp', 'gif', 'avif')),
	CONSTRAINT "files_image_dimensions_check" CHECK((
        "files"."image_width" is null and "files"."image_height" is null
      ) or (
        "files"."image_width" > 0 and "files"."image_height" > 0
      )),
	CONSTRAINT "files_ready_etag_check" CHECK("files"."status" != 'ready' or length("files"."etag") between 1 and 128)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_organization_upload_uidx` ON `files` (`organization_id`,`upload_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `files_object_key_uidx` ON `files` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `files_id_organization_owner_type_uidx` ON `files` (`id`,`organization_id`,`owner_type`);--> statement-breakpoint
CREATE INDEX `files_organization_status_created_idx` ON `files` (`organization_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `files_organization_uploader_idx` ON `files` (`organization_id`,`uploader_id`);--> statement-breakpoint
CREATE TABLE `issue_file_owners` (
	`file_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`owner_type` text DEFAULT 'issue' NOT NULL,
	`issue_id` text NOT NULL,
	FOREIGN KEY (`file_id`,`organization_id`,`owner_type`) REFERENCES `files`(`id`,`organization_id`,`owner_type`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`issue_id`,`organization_id`) REFERENCES `issues`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "issue_file_owners_owner_type_check" CHECK("issue_file_owners"."owner_type" = 'issue')
);
--> statement-breakpoint
CREATE INDEX `issue_file_owners_organization_issue_idx` ON `issue_file_owners` (`organization_id`,`issue_id`);--> statement-breakpoint
CREATE TABLE `organization_file_usage` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`used_bytes` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "organization_file_usage_used_bytes_check" CHECK("organization_file_usage"."used_bytes" between 0 and 1073741824)
);
