CREATE TABLE `profile_image_cleanup_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`object_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`locked_at` integer,
	`next_attempt_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`completed_at` integer,
	CONSTRAINT "profile_image_cleanup_jobs_subject_type_check" CHECK("profile_image_cleanup_jobs"."subject_type" in ('user', 'organization')),
	CONSTRAINT "profile_image_cleanup_jobs_status_check" CHECK("profile_image_cleanup_jobs"."status" in ('pending', 'processing', 'failed', 'completed')),
	CONSTRAINT "profile_image_cleanup_jobs_attempts_check" CHECK("profile_image_cleanup_jobs"."attempts" >= 0),
	CONSTRAINT "profile_image_cleanup_jobs_object_key_check" CHECK(length("profile_image_cleanup_jobs"."object_key") between 1 and 1024),
	CONSTRAINT "profile_image_cleanup_jobs_last_error_code_check" CHECK("profile_image_cleanup_jobs"."last_error_code" is null or (
        length("profile_image_cleanup_jobs"."last_error_code") between 1 and 96
        and "profile_image_cleanup_jobs"."last_error_code" glob '[A-Za-z]*'
        and "profile_image_cleanup_jobs"."last_error_code" not glob '*[^A-Za-z0-9_.:-]*'
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_image_cleanup_jobs_object_key_uidx` ON `profile_image_cleanup_jobs` (`object_key`);--> statement-breakpoint
CREATE INDEX `profile_image_cleanup_jobs_claim_idx` ON `profile_image_cleanup_jobs` (`status`,`next_attempt_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `profile_images` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`user_id` text,
	`organization_id` text,
	`upload_id` text NOT NULL,
	`source_hash` text NOT NULL,
	`version` integer NOT NULL,
	`object_key` text NOT NULL,
	`fallback_url` text,
	`etag` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "profile_images_subject_check" CHECK((
        "profile_images"."subject_type" = 'user'
        and "profile_images"."user_id" is not null
        and "profile_images"."user_id" = "profile_images"."subject_id"
        and "profile_images"."organization_id" is null
      ) or (
        "profile_images"."subject_type" = 'organization'
        and "profile_images"."user_id" is null
        and "profile_images"."organization_id" is not null
        and "profile_images"."organization_id" = "profile_images"."subject_id"
      )),
	CONSTRAINT "profile_images_status_check" CHECK("profile_images"."status" in ('pending', 'ready', 'superseded')),
	CONSTRAINT "profile_images_version_check" CHECK("profile_images"."version" > 0),
	CONSTRAINT "profile_images_upload_id_check" CHECK(length("profile_images"."upload_id") between 1 and 128),
	CONSTRAINT "profile_images_source_hash_check" CHECK(length("profile_images"."source_hash") = 64 and "profile_images"."source_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "profile_images_object_key_check" CHECK(length("profile_images"."object_key") between 1 and 1024),
	CONSTRAINT "profile_images_fallback_url_check" CHECK("profile_images"."fallback_url" is null or length("profile_images"."fallback_url") between 1 and 2048),
	CONSTRAINT "profile_images_ready_etag_check" CHECK("profile_images"."status" != 'ready' or (
        "profile_images"."etag" is not null
        and length("profile_images"."etag") between 1 and 128
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_images_subject_upload_uidx` ON `profile_images` (`subject_type`,`subject_id`,`upload_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `profile_images_subject_version_uidx` ON `profile_images` (`subject_type`,`subject_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `profile_images_subject_ready_uidx` ON `profile_images` (`subject_type`,`subject_id`) WHERE "profile_images"."status" = 'ready';--> statement-breakpoint
CREATE UNIQUE INDEX `profile_images_object_key_uidx` ON `profile_images` (`object_key`);--> statement-breakpoint
CREATE INDEX `profile_images_subject_status_version_idx` ON `profile_images` (`subject_type`,`subject_id`,`status`,`version`);