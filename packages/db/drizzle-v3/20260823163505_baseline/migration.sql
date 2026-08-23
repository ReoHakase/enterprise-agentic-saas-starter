CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`issuer` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`inviter_id` text NOT NULL,
	CONSTRAINT `fk_invitation_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_invitation_inviter_id_user_id_fk` FOREIGN KEY (`inviter_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `member` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_member_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_member_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo` text,
	`created_at` integer NOT NULL,
	`metadata` text
);
--> statement-breakpoint
CREATE TABLE `passkey` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`public_key` text NOT NULL,
	`user_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`counter` integer NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`transports` text,
	`created_at` integer,
	`aaguid` text,
	CONSTRAINT `fk_passkey_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `rate_limit` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL UNIQUE,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL UNIQUE,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`active_organization_id` text,
	CONSTRAINT `fk_session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL UNIQUE,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_audit_logs_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_audit_logs_actor_user_id_user_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
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
	CONSTRAINT `fk_issue_activity_events_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_issue_activity_events_actor_user_id_user_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `issue_activity_events_issue_tenant_fk` FOREIGN KEY (`issue_id`,`organization_id`) REFERENCES `issues`(`id`,`organization_id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `issue_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_issue_comments_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_issue_comments_author_id_user_id_fk` FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `issue_comments_issue_tenant_fk` FOREIGN KEY (`issue_id`,`organization_id`) REFERENCES `issues`(`id`,`organization_id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `issues` (
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
	CONSTRAINT `fk_issues_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_issues_assignee_id_user_id_fk` FOREIGN KEY (`assignee_id`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_issues_creator_id_user_id_fk` FOREIGN KEY (`creator_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "issues_revision_check" CHECK("revision" >= 1)
);
--> statement-breakpoint
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
	`storage_object_id` text,
	`key_version` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_files_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_files_uploader_id_user_id_fk` FOREIGN KEY (`uploader_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `files_storage_object_tenant_fk` FOREIGN KEY (`organization_id`,`storage_object_id`) REFERENCES `storage_objects`(`organization_id`,`id`),
	CONSTRAINT "files_owner_type_check" CHECK("owner_type" in ('issue')),
	CONSTRAINT "files_status_check" CHECK("status" in ('pending', 'ready')),
	CONSTRAINT "files_size_bytes_check" CHECK("size_bytes" between 0 and 20000000),
	CONSTRAINT "files_filename_check" CHECK(length("filename") between 1 and 255),
	CONSTRAINT "files_declared_content_type_check" CHECK(length("declared_content_type") <= 255),
	CONSTRAINT "files_detected_image_format_check" CHECK("detected_image_format" is null or "detected_image_format" in ('jpeg', 'png', 'webp', 'gif', 'avif')),
	CONSTRAINT "files_image_dimensions_check" CHECK((
        "image_width" is null and "image_height" is null
      ) or (
        "image_width" > 0 and "image_height" > 0
      )),
	CONSTRAINT "files_ready_etag_check" CHECK("status" != 'ready' or length("etag") between 1 and 128),
	CONSTRAINT "files_storage_v2_check" CHECK((
        "storage_object_id" is null
        and "key_version" is null
      ) or (
        "storage_object_id" is not null
        and "key_version" is not null
        and "key_version" in (1, 2)
      ))
);
--> statement-breakpoint
CREATE TABLE `organization_file_usage` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`used_bytes` integer DEFAULT 0 NOT NULL,
	`temporary_bytes` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_organization_file_usage_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT "organization_file_usage_used_bytes_check" CHECK("used_bytes" between 0 and 1073741824),
	CONSTRAINT "organization_file_usage_temporary_bytes_check" CHECK("temporary_bytes" between 0 and "used_bytes")
);
--> statement-breakpoint
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
	CONSTRAINT `storage_object_claims_object_tenant_fk` FOREIGN KEY (`organization_id`,`storage_object_id`) REFERENCES `storage_objects`(`organization_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT "storage_object_claims_holder_type_check" CHECK("holder_type" in ('agent_asset', 'transferring', 'file')),
	CONSTRAINT "storage_object_claims_shape_check" CHECK((
        "holder_type" in ('agent_asset', 'file')
        and "holder_id" is not null
        and length("holder_id") between 1 and 128
        and "from_asset_id" is null
        and "to_file_id" is null
      ) or (
        "holder_type" = 'transferring'
        and "holder_id" is null
        and "from_asset_id" is not null
        and length("from_asset_id") between 1 and 128
        and "to_file_id" is not null
        and length("to_file_id") between 1 and 128
      )),
	CONSTRAINT "storage_object_claims_revision_check" CHECK("revision" >= 1)
);
--> statement-breakpoint
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
	CONSTRAINT `fk_storage_objects_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_storage_objects_uploader_id_user_id_fk` FOREIGN KEY (`uploader_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "storage_objects_upload_id_check" CHECK(length("upload_id") between 1 and 128),
	CONSTRAINT "storage_objects_size_bytes_check" CHECK("size_bytes" between 0 and 20000000),
	CONSTRAINT "storage_objects_declared_content_type_check" CHECK(length("declared_content_type") <= 255),
	CONSTRAINT "storage_objects_detected_image_format_check" CHECK("detected_image_format" is null or "detected_image_format" in ('jpeg', 'png', 'webp', 'gif', 'avif')),
	CONSTRAINT "storage_objects_image_dimensions_check" CHECK((
        "image_width" is null and "image_height" is null
      ) or (
        "image_width" is not null
        and "image_height" is not null
        and "image_width" > 0
        and "image_height" > 0
      )),
	CONSTRAINT "storage_objects_status_check" CHECK("status" in ('pending', 'ready', 'deleting', 'deleted')),
	CONSTRAINT "storage_objects_object_key_check" CHECK((
        "status" = 'deleted'
        and "object_key" is null
      ) or (
        "status" != 'deleted'
        and "object_key" is not null
        and length("object_key") between 1 and 1024
      )),
	CONSTRAINT "storage_objects_ready_etag_check" CHECK("status" != 'ready' or (
        "etag" is not null
        and length("etag") between 1 and 128
      )),
	CONSTRAINT "storage_objects_key_version_check" CHECK("key_version" in (1, 2)),
	CONSTRAINT "storage_objects_cleanup_revision_check" CHECK("cleanup_revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE `issue_file_owners` (
	`file_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`owner_type` text DEFAULT 'issue' NOT NULL,
	`issue_id` text NOT NULL,
	CONSTRAINT `issue_file_owners_file_tenant_fk` FOREIGN KEY (`file_id`,`organization_id`,`owner_type`) REFERENCES `files`(`id`,`organization_id`,`owner_type`) ON DELETE CASCADE,
	CONSTRAINT `issue_file_owners_issue_tenant_fk` FOREIGN KEY (`issue_id`,`organization_id`) REFERENCES `issues`(`id`,`organization_id`) ON DELETE CASCADE,
	CONSTRAINT "issue_file_owners_owner_type_check" CHECK("owner_type" = 'issue')
);
--> statement-breakpoint
CREATE TABLE `issue_thumbnail_selections` (
	`organization_id` text NOT NULL,
	`issue_id` text NOT NULL,
	`file_id` text NOT NULL,
	CONSTRAINT `issue_thumbnail_selections_issue_organization_pk` PRIMARY KEY(`issue_id`, `organization_id`),
	CONSTRAINT `issue_thumbnail_selections_issue_tenant_fk` FOREIGN KEY (`issue_id`,`organization_id`) REFERENCES `issues`(`id`,`organization_id`) ON DELETE CASCADE,
	CONSTRAINT `issue_thumbnail_selections_file_owner_tenant_fk` FOREIGN KEY (`file_id`,`organization_id`,`issue_id`) REFERENCES `issue_file_owners`(`file_id`,`organization_id`,`issue_id`) ON DELETE CASCADE
);
--> statement-breakpoint
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
	CONSTRAINT "file_cleanup_jobs_kind_check" CHECK("kind" in ('exact', 'owner_prefix')),
	CONSTRAINT "file_cleanup_jobs_target_check" CHECK((
        "kind" = 'exact'
        and length("object_key") between 1 and 1024
        and "prefix" is null
      ) or (
        "kind" = 'owner_prefix'
        and "object_key" is null
        and length("prefix") between 1 and 1024
      )),
	CONSTRAINT "file_cleanup_jobs_status_check" CHECK("status" in ('pending', 'processing', 'failed', 'completed')),
	CONSTRAINT "file_cleanup_jobs_attempts_check" CHECK("attempts" >= 0),
	CONSTRAINT "file_cleanup_jobs_last_error_code_check" CHECK("last_error_code" is null or (
        length("last_error_code") between 1 and 96
        and "last_error_code" glob '[A-Za-z]*'
        and "last_error_code" not glob '*[^A-Za-z0-9_.:-]*'
      ))
);
--> statement-breakpoint
CREATE TABLE `organization_deletion_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`requested_by_user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`locked_at` integer,
	`next_attempt_at` integer,
	`requested_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`completed_at` integer,
	CONSTRAINT "organization_deletion_jobs_status_check" CHECK("status" in ('pending', 'processing', 'failed', 'completed')),
	CONSTRAINT "organization_deletion_jobs_attempts_check" CHECK("attempts" >= 0)
);
--> statement-breakpoint
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
	CONSTRAINT "storage_object_cleanup_jobs_revision_check" CHECK("expected_cleanup_revision" >= 1),
	CONSTRAINT "storage_object_cleanup_jobs_object_key_check" CHECK(length("object_key") between 1 and 1024),
	CONSTRAINT "storage_object_cleanup_jobs_status_check" CHECK("status" in ('pending', 'processing', 'failed', 'completed')),
	CONSTRAINT "storage_object_cleanup_jobs_attempts_check" CHECK("attempts" >= 0),
	CONSTRAINT "storage_object_cleanup_jobs_last_error_code_check" CHECK("last_error_code" is null or (
        length("last_error_code") between 1 and 96
        and "last_error_code" glob '[A-Za-z]*'
        and "last_error_code" not glob '*[^A-Za-z0-9_.:-]*'
      )),
	CONSTRAINT "storage_object_cleanup_jobs_lease_check" CHECK((
        "status" = 'processing'
        and "lease_token" is not null
        and length("lease_token") = 64
        and "lease_token" not glob '*[^0-9a-f]*'
        and "locked_at" is not null
        and "lease_expires_at" is not null
        and "lease_expires_at" > "locked_at"
      ) or (
        "status" != 'processing'
        and "lease_token" is null
        and "locked_at" is null
        and "lease_expires_at" is null
      )),
	CONSTRAINT "storage_object_cleanup_jobs_completed_at_check" CHECK((
        "status" = 'completed'
        and "completed_at" is not null
      ) or (
        "status" != 'completed'
        and "completed_at" is null
      ))
);
--> statement-breakpoint
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
	CONSTRAINT "profile_image_cleanup_jobs_subject_type_check" CHECK("subject_type" in ('user', 'organization')),
	CONSTRAINT "profile_image_cleanup_jobs_status_check" CHECK("status" in ('pending', 'processing', 'failed', 'completed')),
	CONSTRAINT "profile_image_cleanup_jobs_attempts_check" CHECK("attempts" >= 0),
	CONSTRAINT "profile_image_cleanup_jobs_object_key_check" CHECK(length("object_key") between 1 and 1024),
	CONSTRAINT "profile_image_cleanup_jobs_last_error_code_check" CHECK("last_error_code" is null or (
        length("last_error_code") between 1 and 96
        and "last_error_code" glob '[A-Za-z]*'
        and "last_error_code" not glob '*[^A-Za-z0-9_.:-]*'
      ))
);
--> statement-breakpoint
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
	CONSTRAINT `fk_profile_images_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_profile_images_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT "profile_images_subject_check" CHECK((
        "subject_type" = 'user'
        and "user_id" is not null
        and "user_id" = "subject_id"
        and "organization_id" is null
      ) or (
        "subject_type" = 'organization'
        and "user_id" is null
        and "organization_id" is not null
        and "organization_id" = "subject_id"
      )),
	CONSTRAINT "profile_images_status_check" CHECK("status" in ('pending', 'ready', 'superseded')),
	CONSTRAINT "profile_images_version_check" CHECK("version" > 0),
	CONSTRAINT "profile_images_upload_id_check" CHECK(length("upload_id") between 1 and 128),
	CONSTRAINT "profile_images_source_hash_check" CHECK(length("source_hash") = 64 and "source_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "profile_images_object_key_check" CHECK(length("object_key") between 1 and 1024),
	CONSTRAINT "profile_images_fallback_url_check" CHECK("fallback_url" is null or length("fallback_url") between 1 and 2048),
	CONSTRAINT "profile_images_ready_etag_check" CHECK("status" != 'ready' or (
        "etag" is not null
        and length("etag") between 1 and 128
      ))
);
--> statement-breakpoint
CREATE TABLE `agent_session_contexts` (
	`session_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`context_epoch` integer DEFAULT 1 NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_agent_session_contexts_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_agent_session_contexts_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT "agent_session_contexts_epoch_check" CHECK("context_epoch" >= 1)
);
--> statement-breakpoint
CREATE TABLE `agent_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`archived_at` integer,
	CONSTRAINT `fk_agent_threads_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_agent_threads_owner_user_id_user_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT "agent_threads_status_check" CHECK("status" in ('active', 'archived')),
	CONSTRAINT "agent_threads_archive_check" CHECK(("status" = 'active' and "archived_at" is null)
        or ("status" = 'archived' and "archived_at" is not null))
);
--> statement-breakpoint
CREATE TABLE `agent_connection_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`organization_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`context_epoch` integer NOT NULL,
	`web_search_query_hash` text,
	`issued_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`revoked_at` integer,
	CONSTRAINT `fk_agent_connection_tickets_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_agent_connection_tickets_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_agent_connection_tickets_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `agent_connection_tickets_thread_tenant_fk` FOREIGN KEY (`organization_id`,`thread_id`) REFERENCES `agent_threads`(`organization_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT "agent_connection_tickets_hash_check" CHECK(length("token_hash") = 64
        and "token_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "agent_connection_tickets_epoch_check" CHECK("context_epoch" >= 1),
	CONSTRAINT "agent_connection_tickets_expiry_check" CHECK("expires_at" > "issued_at"
        and "expires_at" <= "issued_at" + 60000),
	CONSTRAINT "agent_connection_tickets_terminal_check" CHECK(not (
        "consumed_at" is not null
        and "revoked_at" is not null
      )
      and ("consumed_at" is null or "consumed_at" >= "issued_at")
      and ("revoked_at" is null or "revoked_at" >= "issued_at"))
);
--> statement-breakpoint
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
	`web_search_query_hash` text,
	`issued_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	CONSTRAINT `fk_agent_grants_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_agent_grants_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_agent_grants_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `agent_grants_thread_tenant_fk` FOREIGN KEY (`organization_id`,`thread_id`) REFERENCES `agent_threads`(`organization_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT `agent_grants_run_tenant_fk` FOREIGN KEY (`organization_id`,`run_id`) REFERENCES `agent_runs`(`organization_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT "agent_grants_hash_check" CHECK(length("token_hash") = 64
        and "token_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "agent_grants_epoch_check" CHECK("context_epoch" >= 1),
	CONSTRAINT "agent_grants_kind_check" CHECK("kind" in ('connection', 'run')),
	CONSTRAINT "agent_grants_run_kind_check" CHECK((
        "kind" = 'connection'
        and "run_id" is null
      ) or (
        "kind" = 'run'
        and "run_id" is not null
      )),
	CONSTRAINT "agent_grants_expiry_check" CHECK("expires_at" > "issued_at"
        and "expires_at" <= "issued_at" + 300000),
	CONSTRAINT "agent_grants_revoked_at_check" CHECK("revoked_at" is null or "revoked_at" >= "issued_at")
);
--> statement-breakpoint
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
	`web_search_query_hash` text,
	`status` text DEFAULT 'running' NOT NULL,
	`scope` text DEFAULT 'chat' NOT NULL,
	`step_count` integer DEFAULT 0 NOT NULL,
	`tool_count` integer DEFAULT 0 NOT NULL,
	`write_count` integer DEFAULT 0 NOT NULL,
	`input_token_count` integer DEFAULT 0 NOT NULL,
	`output_token_count` integer DEFAULT 0 NOT NULL,
	`model_profile_id` text DEFAULT 'openrouter-gpt-5.6-luna-xhigh' NOT NULL,
	`context_window_token_count` integer DEFAULT 1050000 NOT NULL,
	`estimated_input_token_count` integer DEFAULT 0 NOT NULL,
	`reserved_output_token_count` integer DEFAULT 4096 NOT NULL,
	`attempt` integer DEFAULT 1 NOT NULL,
	`started_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL,
	`web_search_used_at` integer,
	`finished_at` integer,
	CONSTRAINT `fk_agent_runs_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_agent_runs_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_agent_runs_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `agent_runs_thread_tenant_fk` FOREIGN KEY (`organization_id`,`thread_id`) REFERENCES `agent_threads`(`organization_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT `agent_runs_root_tenant_fk` FOREIGN KEY (`organization_id`,`root_run_id`) REFERENCES `agent_runs`(`organization_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT `agent_runs_parent_tenant_fk` FOREIGN KEY (`organization_id`,`parent_run_id`) REFERENCES `agent_runs`(`organization_id`,`id`),
	CONSTRAINT "agent_runs_epoch_check" CHECK("context_epoch" >= 1),
	CONSTRAINT "agent_runs_status_check" CHECK("status" in ('running', 'waiting_approval', 'completed', 'failed', 'canceled', 'expired')),
	CONSTRAINT "agent_runs_scope_check" CHECK("scope" in ('chat', 'action_resume')),
	CONSTRAINT "agent_runs_client_message_check" CHECK((
        "scope" = 'chat'
        and length("client_message_id") between 1 and 128
      ) or (
        "scope" = 'action_resume'
        and "client_message_id" is null
      )),
	CONSTRAINT "agent_runs_chain_shape_check" CHECK((
        "root_run_id" = "id"
        and "parent_run_id" is null
        and "scope" = 'chat'
        and "resumed_action_id" is null
      ) or (
        "root_run_id" != "id"
        and "parent_run_id" is not null
        and "scope" = 'action_resume'
        and length("resumed_action_id") between 1 and 128
        and "step_count" = 0
        and "tool_count" = 0
        and "write_count" = 0
        and "input_token_count" = 0
        and "output_token_count" = 0
      )),
	CONSTRAINT "agent_runs_counters_check" CHECK("step_count" >= 0
        and "tool_count" >= 0
        and "write_count" >= 0
        and "input_token_count" >= 0
        and "output_token_count" >= 0
        and "context_window_token_count" >= 1
        and "estimated_input_token_count" >= 0
        and "reserved_output_token_count" >= 1
        and "estimated_input_token_count" + "reserved_output_token_count" <= "context_window_token_count"),
	CONSTRAINT "agent_runs_attempt_check" CHECK("attempt" >= 1),
	CONSTRAINT "agent_runs_expiry_check" CHECK("expires_at" > "started_at"
        and "expires_at" <= "started_at" + 300000),
	CONSTRAINT "agent_runs_finished_at_check" CHECK("finished_at" is null or "finished_at" >= "started_at"),
	CONSTRAINT "agent_runs_web_search_used_at_check" CHECK("web_search_used_at" is null or (
        "web_search_used_at" >= "started_at"
        and "web_search_used_at" <= "expires_at"
      ))
);
--> statement-breakpoint
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
	CONSTRAINT `fk_agent_approval_policies_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_agent_approval_policies_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_agent_approval_policies_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `agent_approval_policies_thread_tenant_fk` FOREIGN KEY (`organization_id`,`thread_id`) REFERENCES `agent_threads`(`organization_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT "agent_approval_policies_mode_check" CHECK("mode" in ('ask_each', 'auto_write', 'auto_all')),
	CONSTRAINT "agent_approval_policies_epoch_check" CHECK("context_epoch" >= 1),
	CONSTRAINT "agent_approval_policies_expiry_check" CHECK("expires_at" > "created_at"
        and "expires_at" <= "created_at" + 900000),
	CONSTRAINT "agent_approval_policies_destructive_check" CHECK((
        "mode" = 'auto_all'
        and "destructive_confirmed_at" is not null
        and "destructive_confirmed_at" >= "created_at"
        and "destructive_confirmed_at" <= "expires_at"
      ) or (
        "mode" != 'auto_all'
        and "destructive_confirmed_at" is null
      )),
	CONSTRAINT "agent_approval_policies_revoked_at_check" CHECK("revoked_at" is null or "revoked_at" >= "created_at")
);
--> statement-breakpoint
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
	CONSTRAINT `fk_agent_thread_permissions_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_agent_thread_permissions_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_agent_thread_permissions_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `agent_thread_permissions_thread_tenant_fk` FOREIGN KEY (`organization_id`,`thread_id`) REFERENCES `agent_threads`(`organization_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT "agent_thread_permissions_mode_check" CHECK("mode" in ('ask_always', 'full_access')),
	CONSTRAINT "agent_thread_permissions_epoch_check" CHECK("context_epoch" >= 1)
);
--> statement-breakpoint
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
	CONSTRAINT `fk_agent_actions_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `agent_actions_run_scope_fk` FOREIGN KEY (`organization_id`,`run_id`,`thread_id`,`session_id`,`user_id`,`context_epoch`) REFERENCES `agent_runs`(`organization_id`,`id`,`thread_id`,`session_id`,`user_id`,`context_epoch`) ON DELETE CASCADE,
	CONSTRAINT `agent_actions_policy_scope_fk` FOREIGN KEY (`organization_id`,`decision_policy_id`,`thread_id`,`session_id`,`user_id`,`context_epoch`) REFERENCES `agent_approval_policies`(`organization_id`,`id`,`thread_id`,`session_id`,`user_id`,`context_epoch`),
	CONSTRAINT "agent_actions_kind_check" CHECK("kind" in ('create_issue', 'update_issue', 'delete_issue')),
	CONSTRAINT "agent_actions_status_check" CHECK("status" in ('pending', 'approved', 'rejected', 'expired', 'canceled', 'succeeded', 'conflicted')),
	CONSTRAINT "agent_actions_epoch_check" CHECK("context_epoch" >= 1),
	CONSTRAINT "agent_actions_tool_call_id_check" CHECK(length("tool_call_id") between 1 and 128),
	CONSTRAINT "agent_actions_target_check" CHECK("target_type" = 'issue'
        and length("target_id") between 1 and 128
        and (
          ("kind" = 'create_issue' and "target_revision" is null)
          or (
            "kind" in ('update_issue', 'delete_issue')
            and "target_revision" is not null
            and "target_revision" >= 1
          )
        )),
	CONSTRAINT "agent_actions_payload_check" CHECK((
        "normalized_payload" is not null
        and json_valid("normalized_payload")
        and "canonical_preview" is not null
        and json_valid("canonical_preview")
        and "scrubbed_at" is null
      ) or (
        "normalized_payload" is null
        and "canonical_preview" is null
        and "scrubbed_at" is not null
        and "status" in ('rejected', 'expired', 'canceled', 'succeeded', 'conflicted')
      )),
	CONSTRAINT "agent_actions_decision_check" CHECK((
        "decision_provenance" is null
        and "decision_policy_id" is null
        and "decision_idempotency_key" is null
        and "decided_at" is null
      ) or (
        "decision_provenance" = 'manual'
        and "decision_policy_id" is null
        and "decision_idempotency_key" is not null
        and length("decision_idempotency_key") between 1 and 128
        and "decided_at" is not null
      ) or (
        "decision_provenance" = 'auto_policy'
        and "decision_policy_id" is not null
        and "decision_idempotency_key" is null
        and "decided_at" is not null
      )),
	CONSTRAINT "agent_actions_status_shape_check" CHECK((
        "status" = 'pending'
        and "decision_provenance" is null
        and "completed_at" is null
        and "receipt" is null
        and "result_id" is null
        and "error_classification" is null
      ) or (
        "status" = 'approved'
        and "decision_provenance" is not null
        and "completed_at" is null
        and "receipt" is null
        and "result_id" is null
        and "error_classification" is null
      ) or (
        "status" = 'rejected'
        and "decision_provenance" = 'manual'
        and "completed_at" is not null
        and "receipt" is null
        and "result_id" is null
        and "error_classification" is null
      ) or (
        "status" in ('expired', 'canceled')
        and "completed_at" is not null
        and "receipt" is null
        and "result_id" is null
        and "error_classification" is null
      ) or (
        "status" = 'conflicted'
        and "decision_provenance" is not null
        and "completed_at" is not null
        and "receipt" is null
        and "result_id" is null
        and "error_classification" is not null
      ) or (
        "status" = 'succeeded'
        and "decision_provenance" is not null
        and "completed_at" is not null
        and "receipt" is not null
        and json_valid("receipt")
        and "result_id" is not null
        and "error_classification" is null
      )),
	CONSTRAINT "agent_actions_idempotency_key_check" CHECK(length("idempotency_key") between 1 and 128),
	CONSTRAINT "agent_actions_result_id_check" CHECK("result_id" is null or length("result_id") between 1 and 128),
	CONSTRAINT "agent_actions_error_classification_check" CHECK("error_classification" is null or (
        length("error_classification") between 1 and 96
        and "error_classification" glob '[A-Za-z]*'
        and "error_classification" not glob '*[^A-Za-z0-9_.:-]*'
      )),
	CONSTRAINT "agent_actions_attempt_check" CHECK("attempt" >= 0),
	CONSTRAINT "agent_actions_expiry_check" CHECK("expires_at" > "created_at"
        and "expires_at" <= "created_at" + 900000),
	CONSTRAINT "agent_actions_timestamps_check" CHECK(("decided_at" is null or (
          "decided_at" >= "created_at"
          and "decided_at" <= "expires_at"
        ))
        and ("completed_at" is null or "completed_at" >= "created_at")
        and ("scrubbed_at" is null or (
          "completed_at" is not null
          and "scrubbed_at" >= "completed_at"
        )))
);
--> statement-breakpoint
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
	CONSTRAINT `agent_resume_tickets_action_scope_fk` FOREIGN KEY (`organization_id`,`action_id`,`thread_id`,`session_id`,`user_id`,`context_epoch`) REFERENCES `agent_actions`(`organization_id`,`id`,`thread_id`,`session_id`,`user_id`,`context_epoch`) ON DELETE CASCADE,
	CONSTRAINT "agent_resume_tickets_hash_check" CHECK(length("token_hash") = 64
        and "token_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "agent_resume_tickets_epoch_check" CHECK("context_epoch" >= 1),
	CONSTRAINT "agent_resume_tickets_expiry_check" CHECK("expires_at" > "issued_at"
        and "expires_at" <= "issued_at" + 60000),
	CONSTRAINT "agent_resume_tickets_terminal_check" CHECK(not (
        "consumed_at" is not null
        and "revoked_at" is not null
      )
      and ("consumed_at" is null or "consumed_at" >= "issued_at")
      and ("revoked_at" is null or "revoked_at" >= "issued_at"))
);
--> statement-breakpoint
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
	CONSTRAINT `agent_action_assets_pk` PRIMARY KEY(`action_id`, `asset_id`),
	CONSTRAINT `agent_action_assets_action_tenant_fk` FOREIGN KEY (`organization_id`,`action_id`) REFERENCES `agent_actions`(`organization_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT `agent_action_assets_asset_tenant_fk` FOREIGN KEY (`organization_id`,`asset_id`) REFERENCES `agent_assets`(`organization_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT `agent_action_assets_storage_object_tenant_fk` FOREIGN KEY (`organization_id`,`storage_object_id`) REFERENCES `storage_objects`(`organization_id`,`id`),
	CONSTRAINT "agent_action_assets_source_etag_check" CHECK(length("source_etag") between 1 and 128),
	CONSTRAINT "agent_action_assets_size_bytes_check" CHECK("size_bytes" between 0 and 10000000),
	CONSTRAINT "agent_action_assets_lease_check" CHECK("lease_expires_at" > "created_at"
        and ("released_at" is null or "released_at" >= "created_at")
        and ("quota_classified_at" is null or (
          "quota_classified_at" >= "created_at"
          and ("released_at" is null or "quota_classified_at" <= "released_at")
        ))),
	CONSTRAINT "agent_action_assets_storage_state_check" CHECK("storage_object_id" is not null or "released_at" is not null)
);
--> statement-breakpoint
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
	CONSTRAINT `fk_agent_assets_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_agent_assets_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_agent_assets_uploader_id_user_id_fk` FOREIGN KEY (`uploader_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `agent_assets_thread_tenant_fk` FOREIGN KEY (`organization_id`,`thread_id`) REFERENCES `agent_threads`(`organization_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT `agent_assets_storage_object_tenant_fk` FOREIGN KEY (`organization_id`,`storage_object_id`) REFERENCES `storage_objects`(`organization_id`,`id`),
	CONSTRAINT `agent_assets_promoted_file_tenant_fk` FOREIGN KEY (`organization_id`,`promoted_file_id`) REFERENCES `files`(`organization_id`,`id`),
	CONSTRAINT "agent_assets_epoch_check" CHECK("context_epoch" >= 1),
	CONSTRAINT "agent_assets_session_id_check" CHECK("session_id" is null or length("session_id") between 1 and 128),
	CONSTRAINT "agent_assets_filename_check" CHECK(length("filename") between 1 and 255),
	CONSTRAINT "agent_assets_status_check" CHECK("status" in ('pending', 'ready', 'promoting', 'promoted', 'expired', 'deleted')),
	CONSTRAINT "agent_assets_state_shape_check" CHECK((
        "status" in ('pending', 'ready', 'promoting')
        and "storage_object_id" is not null
        and "promoted_file_id" is null
      ) or (
        "status" = 'promoted'
        and "storage_object_id" is null
        and "promoted_file_id" is not null
      ) or (
        "status" in ('expired', 'deleted')
        and "storage_object_id" is null
        and "promoted_file_id" is null
      )),
	CONSTRAINT "agent_assets_expiry_check" CHECK("expires_at" > "created_at"
        and "expires_at" <= "created_at" + 604800000)
);
--> statement-breakpoint
CREATE TABLE `agent_run_assets` (
	`organization_id` text NOT NULL,
	`run_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`storage_object_id` text,
	`source_etag` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `agent_run_assets_pk` PRIMARY KEY(`run_id`, `asset_id`),
	CONSTRAINT `agent_run_assets_run_tenant_fk` FOREIGN KEY (`organization_id`,`run_id`) REFERENCES `agent_runs`(`organization_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT `agent_run_assets_asset_tenant_fk` FOREIGN KEY (`organization_id`,`asset_id`) REFERENCES `agent_assets`(`organization_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT `agent_run_assets_storage_object_tenant_fk` FOREIGN KEY (`organization_id`,`storage_object_id`) REFERENCES `storage_objects`(`organization_id`,`id`),
	CONSTRAINT "agent_run_assets_source_etag_check" CHECK(length("source_etag") between 1 and 128),
	CONSTRAINT "agent_run_assets_size_bytes_check" CHECK("size_bytes" between 0 and 10000000)
);
--> statement-breakpoint
CREATE TABLE `agent_model_prices` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`pricing_version` text NOT NULL,
	`effective_from` integer NOT NULL,
	`effective_to` integer,
	`input_price_micros_per_million` integer NOT NULL,
	`cache_read_price_micros_per_million` integer NOT NULL,
	`cache_write_price_micros_per_million` integer NOT NULL,
	`output_price_micros_per_million` integer NOT NULL,
	`tier_threshold_token_count` integer,
	`tier_input_price_micros_per_million` integer,
	`tier_cache_read_price_micros_per_million` integer,
	`tier_cache_write_price_micros_per_million` integer,
	`tier_output_price_micros_per_million` integer,
	`currency` text DEFAULT 'USD' NOT NULL,
	CONSTRAINT "agent_model_prices_values_check" CHECK(length("provider") between 1 and 64
        and length("model") between 1 and 160
        and length("pricing_version") between 1 and 160
        and ("effective_to" is null or "effective_to" > "effective_from")
        and "input_price_micros_per_million" >= 0
        and "cache_read_price_micros_per_million" >= 0
        and "cache_write_price_micros_per_million" >= 0
        and "output_price_micros_per_million" >= 0
        and (
          ("tier_threshold_token_count" is null
            and "tier_input_price_micros_per_million" is null
            and "tier_cache_read_price_micros_per_million" is null
            and "tier_cache_write_price_micros_per_million" is null
            and "tier_output_price_micros_per_million" is null)
          or
          ("tier_threshold_token_count" >= 1
            and "tier_input_price_micros_per_million" >= 0
            and "tier_cache_read_price_micros_per_million" >= 0
            and "tier_cache_write_price_micros_per_million" >= 0
            and "tier_output_price_micros_per_million" >= 0)
        )
        and "currency" = 'USD')
);
--> statement-breakpoint
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
	CONSTRAINT `fk_agent_resource_usage_buckets_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_agent_resource_usage_buckets_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT "agent_resource_usage_buckets_kind_check" CHECK("kind" in ('asset_upload', 'vision_transform', 'write_action', 'staged_asset', 'pending_upload', 'model_run', 'web_search')),
	CONSTRAINT "agent_resource_usage_buckets_window_check" CHECK("window_end" > "window_start"),
	CONSTRAINT "agent_resource_usage_buckets_count_check" CHECK("limit_count" >= 0 and "count" between 0 and "limit_count")
);
--> statement-breakpoint
CREATE TABLE `agent_resource_usage_operations` (
	`operation_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`bucket_id` text NOT NULL,
	`delta` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `agent_resource_usage_operations_pk` PRIMARY KEY(`bucket_id`, `operation_id`),
	CONSTRAINT `agent_resource_usage_operations_bucket_tenant_fk` FOREIGN KEY (`organization_id`,`bucket_id`) REFERENCES `agent_resource_usage_buckets`(`organization_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT "agent_resource_usage_operations_id_check" CHECK(length("operation_id") between 1 and 160),
	CONSTRAINT "agent_resource_usage_operations_delta_check" CHECK("delta" between -1073741824 and 1073741824
        and "delta" != 0)
);
--> statement-breakpoint
CREATE TABLE `agent_usage_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`run_count` integer DEFAULT 0 NOT NULL,
	`input_token_count` integer DEFAULT 0 NOT NULL,
	`output_token_count` integer DEFAULT 0 NOT NULL,
	`reasoning_token_count` integer DEFAULT 0 NOT NULL,
	`total_token_count` integer DEFAULT 0 NOT NULL,
	`cost_micros` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_agent_usage_daily_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_agent_usage_daily_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT "agent_usage_daily_values_check" CHECK("date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        and length("provider") between 1 and 64
        and length("model") between 1 and 160
        and "run_count" >= 0
        and "input_token_count" >= 0
        and "output_token_count" >= 0
        and "reasoning_token_count" >= 0
        and "total_token_count" = "input_token_count" + "output_token_count"
        and "cost_micros" >= 0)
);
--> statement-breakpoint
CREATE TABLE `agent_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`run_id` text NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`input_token_count` integer DEFAULT 0 NOT NULL,
	`input_no_cache_token_count` integer DEFAULT 0 NOT NULL,
	`cache_read_token_count` integer DEFAULT 0 NOT NULL,
	`cache_write_token_count` integer DEFAULT 0 NOT NULL,
	`output_token_count` integer DEFAULT 0 NOT NULL,
	`text_output_token_count` integer DEFAULT 0 NOT NULL,
	`reasoning_token_count` integer DEFAULT 0 NOT NULL,
	`total_token_count` integer DEFAULT 0 NOT NULL,
	`image_input_count` integer DEFAULT 0 NOT NULL,
	`calculated_cost_micros` integer DEFAULT 0 NOT NULL,
	`provider_cost_micros` integer,
	`pricing_version` text DEFAULT 'unpriced' NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`is_estimate` integer DEFAULT false NOT NULL,
	`duration_ms` integer NOT NULL,
	`provider_request_id` text,
	`run_event_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_agent_usage_events_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_agent_usage_events_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `agent_usage_events_run_scope_fk` FOREIGN KEY (`organization_id`,`run_id`,`thread_id`) REFERENCES `agent_runs`(`organization_id`,`id`,`thread_id`) ON DELETE CASCADE,
	CONSTRAINT "agent_usage_events_provider_check" CHECK(length("provider") between 1 and 64),
	CONSTRAINT "agent_usage_events_model_check" CHECK(length("model") between 1 and 160),
	CONSTRAINT "agent_usage_events_counts_check" CHECK("input_token_count" >= 0
        and "input_no_cache_token_count" >= 0
        and "cache_read_token_count" >= 0
        and "cache_write_token_count" >= 0
        and "output_token_count" >= 0
        and "text_output_token_count" >= 0
        and "reasoning_token_count" >= 0
        and "total_token_count" >= 0
        and "image_input_count" >= 0
        and "calculated_cost_micros" >= 0
        and ("provider_cost_micros" is null or "provider_cost_micros" >= 0)
        and "duration_ms" between 0 and 300000),
	CONSTRAINT "agent_usage_events_token_shape_check" CHECK("input_no_cache_token_count" + "cache_read_token_count" + "cache_write_token_count" <= "input_token_count"
        and "text_output_token_count" + "reasoning_token_count" <= "output_token_count"
        and "total_token_count" = "input_token_count" + "output_token_count"),
	CONSTRAINT "agent_usage_events_billing_check" CHECK(length("pricing_version") between 1 and 160
        and "currency" = 'USD'),
	CONSTRAINT "agent_usage_events_idempotency_check" CHECK((
        "provider_request_id" is not null
        and length("provider_request_id") between 1 and 160
      ) or (
        "run_event_id" is not null
        and length("run_event_id") between 1 and 160
      ))
);
--> statement-breakpoint
CREATE TABLE `mcp_attachment_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`storage_object_id` text NOT NULL,
	`filename` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_mcp_attachment_uploads_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_mcp_attachment_uploads_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_mcp_attachment_uploads_client_id_oauth_client_client_id_fk` FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON DELETE CASCADE,
	CONSTRAINT `mcp_attachment_uploads_storage_tenant_fk` FOREIGN KEY (`organization_id`,`storage_object_id`) REFERENCES `storage_objects`(`organization_id`,`id`),
	CONSTRAINT "mcp_attachment_uploads_filename_check" CHECK(length("filename") between 1 and 255),
	CONSTRAINT "mcp_attachment_uploads_status_check" CHECK("status" in ('pending', 'ready', 'consumed', 'expired')),
	CONSTRAINT "mcp_attachment_uploads_expiry_check" CHECK("expires_at" > "created_at" and "expires_at" <= "created_at" + 900000),
	CONSTRAINT "mcp_attachment_uploads_consumed_at_check" CHECK(("status" = 'consumed' and "consumed_at" is not null) or ("status" != 'consumed' and "consumed_at" is null))
);
--> statement-breakpoint
CREATE TABLE `mcp_tool_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`payload_digest` text NOT NULL,
	`receipt` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_mcp_tool_operations_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_mcp_tool_operations_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_mcp_tool_operations_client_id_oauth_client_client_id_fk` FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON DELETE CASCADE,
	CONSTRAINT "mcp_tool_operations_tool_name_check" CHECK(length("tool_name") between 1 and 96),
	CONSTRAINT "mcp_tool_operations_idempotency_key_check" CHECK(length("idempotency_key") between 16 and 128),
	CONSTRAINT "mcp_tool_operations_payload_digest_check" CHECK(length("payload_digest") = 64 and "payload_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "mcp_tool_operations_receipt_check" CHECK(json_valid("receipt") and json_type("receipt") = 'object')
);
--> statement-breakpoint
CREATE TABLE `oauth_access_token` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text UNIQUE,
	`client_id` text NOT NULL,
	`session_id` text,
	`user_id` text,
	`reference_id` text,
	`authorization_code_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`refresh_id` text,
	`expires_at` integer,
	`created_at` integer,
	`revoked` integer,
	`confirmation` text,
	`scopes` text NOT NULL,
	CONSTRAINT `fk_oauth_access_token_client_id_oauth_client_client_id_fk` FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_oauth_access_token_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_oauth_access_token_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_oauth_access_token_refresh_id_oauth_refresh_token_id_fk` FOREIGN KEY (`refresh_id`) REFERENCES `oauth_refresh_token`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `oauth_client` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL UNIQUE,
	`client_secret` text,
	`client_discovery_id` text,
	`disabled` integer DEFAULT false,
	`skip_consent` integer,
	`enable_end_session` integer,
	`subject_type` text,
	`scopes` text,
	`client_credentials_scopes` text DEFAULT '[]',
	`user_id` text,
	`created_at` integer,
	`updated_at` integer,
	`name` text,
	`uri` text,
	`icon` text,
	`contacts` text,
	`tos` text,
	`policy` text,
	`software_id` text,
	`software_version` text,
	`software_statement` text,
	`redirect_uris` text NOT NULL,
	`post_logout_redirect_uris` text,
	`backchannel_logout_uri` text,
	`backchannel_logout_session_required` integer,
	`token_endpoint_auth_method` text,
	`application_type` text,
	`jwks` text,
	`jwks_uri` text,
	`grant_types` text,
	`response_types` text,
	`public` integer,
	`type` text,
	`require_pkce` integer,
	`dpop_bound_access_tokens` integer DEFAULT false,
	`reference_id` text,
	`metadata` text,
	CONSTRAINT `fk_oauth_client_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `oauth_client_assertion` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_client_resource` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`metadata` text,
	`created_at` integer,
	CONSTRAINT `fk_oauth_client_resource_client_id_oauth_client_client_id_fk` FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_oauth_client_resource_resource_id_oauth_resource_identifier_fk` FOREIGN KEY (`resource_id`) REFERENCES `oauth_resource`(`identifier`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `oauth_consent` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text,
	`reference_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`scopes` text NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	CONSTRAINT `fk_oauth_consent_client_id_oauth_client_client_id_fk` FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_oauth_consent_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `oauth_refresh_token` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL UNIQUE,
	`client_id` text NOT NULL,
	`session_id` text,
	`user_id` text NOT NULL,
	`reference_id` text,
	`authorization_code_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`expires_at` integer,
	`created_at` integer,
	`revoked` integer,
	`rotated_at` integer,
	`rotation_replay_response` text,
	`rotation_replay_expires_at` integer,
	`auth_time` integer,
	`confirmation` text,
	`scopes` text NOT NULL,
	CONSTRAINT `fk_oauth_refresh_token_client_id_oauth_client_client_id_fk` FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_oauth_refresh_token_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_oauth_refresh_token_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `oauth_resource` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`access_token_ttl` integer,
	`refresh_token_ttl` integer,
	`signing_algorithm` text,
	`signing_key_id` text,
	`allowed_scopes` text,
	`custom_claims` text,
	`dpop_bound_access_tokens_required` integer DEFAULT false,
	`disabled` integer DEFAULT false,
	`created_at` integer,
	`updated_at` integer,
	`policy_version` integer DEFAULT 1,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_issuer_accountId_uidx` ON `account` (`issuer`,`account_id`);--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `invitation_organizationId_idx` ON `invitation` (`organization_id`);--> statement-breakpoint
CREATE INDEX `invitation_email_idx` ON `invitation` (`email`);--> statement-breakpoint
CREATE INDEX `member_organizationId_idx` ON `member` (`organization_id`);--> statement-breakpoint
CREATE INDEX `member_userId_idx` ON `member` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `member_organization_user_uidx` ON `member` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `member_organization_owner_uidx` ON `member` (`organization_id`) WHERE "member"."role" = 'owner';--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_uidx` ON `organization` (`slug`);--> statement-breakpoint
CREATE INDEX `passkey_userId_idx` ON `passkey` (`user_id`);--> statement-breakpoint
CREATE INDEX `passkey_credentialID_idx` ON `passkey` (`credential_id`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `audit_logs_organization_created_idx` ON `audit_logs` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_organization_action_created_idx` ON `audit_logs` (`organization_id`,`action`,`created_at`);--> statement-breakpoint
CREATE INDEX `issue_activity_events_issue_created_idx` ON `issue_activity_events` (`organization_id`,`issue_id`,`created_at`,`position`);--> statement-breakpoint
CREATE INDEX `issue_comments_organization_issue_created_idx` ON `issue_comments` (`organization_id`,`issue_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `issue_comments_organization_author_idx` ON `issue_comments` (`organization_id`,`author_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `issues_organization_number_uidx` ON `issues` (`organization_id`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `issues_id_organization_uidx` ON `issues` (`id`,`organization_id`);--> statement-breakpoint
CREATE INDEX `issues_organization_status_idx` ON `issues` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `issues_organization_assignee_idx` ON `issues` (`organization_id`,`assignee_id`);--> statement-breakpoint
CREATE INDEX `issues_organization_creator_idx` ON `issues` (`organization_id`,`creator_id`);--> statement-breakpoint
CREATE INDEX `issues_organization_due_date_idx` ON `issues` (`organization_id`,`due_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `files_organization_upload_uidx` ON `files` (`organization_id`,`upload_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `files_object_key_uidx` ON `files` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `files_id_organization_owner_type_uidx` ON `files` (`id`,`organization_id`,`owner_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `files_organization_id_uidx` ON `files` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `files_storage_object_uidx` ON `files` (`storage_object_id`) WHERE "files"."storage_object_id" is not null;--> statement-breakpoint
CREATE INDEX `files_organization_status_created_idx` ON `files` (`organization_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `files_organization_uploader_idx` ON `files` (`organization_id`,`uploader_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `storage_object_claims_holder_uidx` ON `storage_object_claims` (`organization_id`,`holder_type`,`holder_id`) WHERE "storage_object_claims"."holder_type" in ('agent_asset', 'file');--> statement-breakpoint
CREATE UNIQUE INDEX `storage_object_claims_transfer_from_uidx` ON `storage_object_claims` (`organization_id`,`from_asset_id`) WHERE "storage_object_claims"."holder_type" = 'transferring';--> statement-breakpoint
CREATE UNIQUE INDEX `storage_object_claims_transfer_to_uidx` ON `storage_object_claims` (`organization_id`,`to_file_id`) WHERE "storage_object_claims"."holder_type" = 'transferring';--> statement-breakpoint
CREATE INDEX `storage_object_claims_organization_holder_idx` ON `storage_object_claims` (`organization_id`,`holder_type`,`holder_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `storage_objects_organization_id_uidx` ON `storage_objects` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `storage_objects_organization_upload_uidx` ON `storage_objects` (`organization_id`,`upload_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `storage_objects_object_key_uidx` ON `storage_objects` (`object_key`) WHERE "storage_objects"."object_key" is not null;--> statement-breakpoint
CREATE INDEX `storage_objects_organization_status_created_idx` ON `storage_objects` (`organization_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `storage_objects_cleanup_idx` ON `storage_objects` (`status`,`cleanup_revision`,`updated_at`);--> statement-breakpoint
CREATE INDEX `storage_objects_uploader_idx` ON `storage_objects` (`organization_id`,`uploader_id`);--> statement-breakpoint
CREATE INDEX `issue_file_owners_organization_issue_idx` ON `issue_file_owners` (`organization_id`,`issue_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `issue_file_owners_file_organization_issue_uidx` ON `issue_file_owners` (`file_id`,`organization_id`,`issue_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `file_cleanup_jobs_object_key_uidx` ON `file_cleanup_jobs` (`object_key`) WHERE "file_cleanup_jobs"."kind" = 'exact';--> statement-breakpoint
CREATE UNIQUE INDEX `file_cleanup_jobs_prefix_uidx` ON `file_cleanup_jobs` (`prefix`) WHERE "file_cleanup_jobs"."kind" = 'owner_prefix';--> statement-breakpoint
CREATE INDEX `file_cleanup_jobs_organization_idx` ON `file_cleanup_jobs` (`organization_id`);--> statement-breakpoint
CREATE INDEX `file_cleanup_jobs_claim_idx` ON `file_cleanup_jobs` (`status`,`next_attempt_at`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_deletion_jobs_request_uidx` ON `organization_deletion_jobs` (`requested_by_user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `organization_deletion_jobs_organization_idx` ON `organization_deletion_jobs` (`organization_id`);--> statement-breakpoint
CREATE INDEX `organization_deletion_jobs_retry_idx` ON `organization_deletion_jobs` (`status`,`next_attempt_at`,`requested_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `storage_object_cleanup_jobs_revision_uidx` ON `storage_object_cleanup_jobs` (`storage_object_id`,`expected_cleanup_revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `storage_object_cleanup_jobs_object_key_uidx` ON `storage_object_cleanup_jobs` (`object_key`);--> statement-breakpoint
CREATE INDEX `storage_object_cleanup_jobs_organization_idx` ON `storage_object_cleanup_jobs` (`organization_id`);--> statement-breakpoint
CREATE INDEX `storage_object_cleanup_jobs_claim_idx` ON `storage_object_cleanup_jobs` (`status`,`next_attempt_at`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `profile_image_cleanup_jobs_object_key_uidx` ON `profile_image_cleanup_jobs` (`object_key`);--> statement-breakpoint
CREATE INDEX `profile_image_cleanup_jobs_claim_idx` ON `profile_image_cleanup_jobs` (`status`,`next_attempt_at`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `profile_images_subject_upload_uidx` ON `profile_images` (`subject_type`,`subject_id`,`upload_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `profile_images_subject_version_uidx` ON `profile_images` (`subject_type`,`subject_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `profile_images_subject_ready_uidx` ON `profile_images` (`subject_type`,`subject_id`) WHERE "profile_images"."status" = 'ready';--> statement-breakpoint
CREATE UNIQUE INDEX `profile_images_object_key_uidx` ON `profile_images` (`object_key`);--> statement-breakpoint
CREATE INDEX `profile_images_subject_status_version_idx` ON `profile_images` (`subject_type`,`subject_id`,`status`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_session_contexts_scope_uidx` ON `agent_session_contexts` (`session_id`,`user_id`,`context_epoch`);--> statement-breakpoint
CREATE INDEX `agent_session_contexts_user_idx` ON `agent_session_contexts` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_threads_organization_id_uidx` ON `agent_threads` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `agent_threads_owner_status_created_idx` ON `agent_threads` (`organization_id`,`owner_user_id`,`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_connection_tickets_hash_uidx` ON `agent_connection_tickets` (`token_hash`);--> statement-breakpoint
CREATE INDEX `agent_connection_tickets_expiry_idx` ON `agent_connection_tickets` (`expires_at`);--> statement-breakpoint
CREATE INDEX `agent_connection_tickets_session_epoch_idx` ON `agent_connection_tickets` (`session_id`,`context_epoch`);--> statement-breakpoint
CREATE INDEX `agent_connection_tickets_thread_idx` ON `agent_connection_tickets` (`organization_id`,`thread_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_grants_hash_uidx` ON `agent_grants` (`token_hash`);--> statement-breakpoint
CREATE INDEX `agent_grants_expiry_idx` ON `agent_grants` (`expires_at`);--> statement-breakpoint
CREATE INDEX `agent_grants_session_epoch_idx` ON `agent_grants` (`session_id`,`context_epoch`);--> statement-breakpoint
CREATE INDEX `agent_grants_run_idx` ON `agent_grants` (`organization_id`,`run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_runs_organization_id_uidx` ON `agent_runs` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_runs_action_scope_uidx` ON `agent_runs` (`organization_id`,`id`,`thread_id`,`session_id`,`user_id`,`context_epoch`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_runs_usage_scope_uidx` ON `agent_runs` (`organization_id`,`id`,`thread_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_runs_thread_client_message_uidx` ON `agent_runs` (`thread_id`,`client_message_id`) WHERE "agent_runs"."client_message_id" is not null;--> statement-breakpoint
CREATE INDEX `agent_runs_thread_status_started_idx` ON `agent_runs` (`organization_id`,`thread_id`,`status`,`started_at`);--> statement-breakpoint
CREATE INDEX `agent_runs_root_idx` ON `agent_runs` (`organization_id`,`root_run_id`);--> statement-breakpoint
CREATE INDEX `agent_runs_session_epoch_idx` ON `agent_runs` (`session_id`,`context_epoch`);--> statement-breakpoint
CREATE INDEX `agent_runs_expiry_idx` ON `agent_runs` (`status`,`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_approval_policies_organization_id_uidx` ON `agent_approval_policies` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_approval_policies_action_scope_uidx` ON `agent_approval_policies` (`organization_id`,`id`,`thread_id`,`session_id`,`user_id`,`context_epoch`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_approval_policies_active_scope_uidx` ON `agent_approval_policies` (`session_id`,`user_id`,`organization_id`,`thread_id`) WHERE "agent_approval_policies"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX `agent_approval_policies_expiry_idx` ON `agent_approval_policies` (`revoked_at`,`expires_at`);--> statement-breakpoint
CREATE INDEX `agent_approval_policies_session_epoch_idx` ON `agent_approval_policies` (`session_id`,`context_epoch`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_thread_permissions_scope_uidx` ON `agent_thread_permissions` (`session_id`,`user_id`,`organization_id`,`thread_id`);--> statement-breakpoint
CREATE INDEX `agent_thread_permissions_session_epoch_idx` ON `agent_thread_permissions` (`session_id`,`context_epoch`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_actions_organization_id_uidx` ON `agent_actions` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_actions_resume_scope_uidx` ON `agent_actions` (`organization_id`,`id`,`thread_id`,`session_id`,`user_id`,`context_epoch`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_actions_idempotency_uidx` ON `agent_actions` (`organization_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_actions_run_tool_call_uidx` ON `agent_actions` (`organization_id`,`run_id`,`tool_call_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_actions_decision_idempotency_uidx` ON `agent_actions` (`organization_id`,`decision_idempotency_key`) WHERE "agent_actions"."decision_idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX `agent_actions_thread_status_created_idx` ON `agent_actions` (`organization_id`,`thread_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_actions_session_epoch_status_idx` ON `agent_actions` (`session_id`,`context_epoch`,`status`);--> statement-breakpoint
CREATE INDEX `agent_actions_expiry_idx` ON `agent_actions` (`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `agent_actions_target_idx` ON `agent_actions` (`organization_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_resume_tickets_hash_uidx` ON `agent_resume_tickets` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_resume_tickets_active_action_uidx` ON `agent_resume_tickets` (`organization_id`,`action_id`) WHERE "agent_resume_tickets"."consumed_at" is null and "agent_resume_tickets"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX `agent_resume_tickets_expiry_idx` ON `agent_resume_tickets` (`expires_at`);--> statement-breakpoint
CREATE INDEX `agent_resume_tickets_action_idx` ON `agent_resume_tickets` (`organization_id`,`action_id`);--> statement-breakpoint
CREATE INDEX `agent_resume_tickets_session_epoch_idx` ON `agent_resume_tickets` (`session_id`,`context_epoch`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_action_assets_active_asset_uidx` ON `agent_action_assets` (`asset_id`) WHERE "agent_action_assets"."released_at" is null;--> statement-breakpoint
CREATE INDEX `agent_action_assets_organization_action_idx` ON `agent_action_assets` (`organization_id`,`action_id`);--> statement-breakpoint
CREATE INDEX `agent_action_assets_active_lease_idx` ON `agent_action_assets` (`released_at`,`lease_expires_at`);--> statement-breakpoint
CREATE INDEX `agent_action_assets_storage_object_idx` ON `agent_action_assets` (`storage_object_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_assets_organization_id_uidx` ON `agent_assets` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_assets_storage_object_uidx` ON `agent_assets` (`storage_object_id`) WHERE "agent_assets"."storage_object_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_assets_promoted_file_uidx` ON `agent_assets` (`promoted_file_id`) WHERE "agent_assets"."promoted_file_id" is not null;--> statement-breakpoint
CREATE INDEX `agent_assets_thread_status_expiry_idx` ON `agent_assets` (`organization_id`,`thread_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `agent_assets_cleanup_idx` ON `agent_assets` (`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `agent_run_assets_organization_run_idx` ON `agent_run_assets` (`organization_id`,`run_id`);--> statement-breakpoint
CREATE INDEX `agent_run_assets_storage_object_idx` ON `agent_run_assets` (`storage_object_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_model_prices_version_uidx` ON `agent_model_prices` (`provider`,`model`,`pricing_version`);--> statement-breakpoint
CREATE INDEX `agent_model_prices_effective_idx` ON `agent_model_prices` (`provider`,`model`,`effective_from`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_resource_usage_buckets_organization_id_uidx` ON `agent_resource_usage_buckets` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_resource_usage_buckets_organization_scope_uidx` ON `agent_resource_usage_buckets` (`organization_id`,`kind`,`window_start`) WHERE "agent_resource_usage_buckets"."user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_resource_usage_buckets_user_scope_uidx` ON `agent_resource_usage_buckets` (`organization_id`,`user_id`,`kind`,`window_start`) WHERE "agent_resource_usage_buckets"."user_id" is not null;--> statement-breakpoint
CREATE INDEX `agent_resource_usage_buckets_window_end_idx` ON `agent_resource_usage_buckets` (`window_end`);--> statement-breakpoint
CREATE INDEX `agent_resource_usage_operations_bucket_created_idx` ON `agent_resource_usage_operations` (`organization_id`,`bucket_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_usage_daily_scope_uidx` ON `agent_usage_daily` (`date`,`organization_id`,`user_id`,`provider`,`model`);--> statement-breakpoint
CREATE INDEX `agent_usage_daily_organization_date_idx` ON `agent_usage_daily` (`organization_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_usage_events_provider_request_uidx` ON `agent_usage_events` (`organization_id`,`provider`,`provider_request_id`) WHERE "agent_usage_events"."provider_request_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_usage_events_run_event_uidx` ON `agent_usage_events` (`organization_id`,`run_id`,`run_event_id`) WHERE "agent_usage_events"."run_event_id" is not null;--> statement-breakpoint
CREATE INDEX `agent_usage_events_run_created_idx` ON `agent_usage_events` (`organization_id`,`run_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_attachment_uploads_storage_object_uidx` ON `mcp_attachment_uploads` (`storage_object_id`);--> statement-breakpoint
CREATE INDEX `mcp_attachment_uploads_owner_status_idx` ON `mcp_attachment_uploads` (`organization_id`,`user_id`,`client_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_tool_operations_idempotency_uidx` ON `mcp_tool_operations` (`organization_id`,`user_id`,`client_id`,`tool_name`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `mcp_tool_operations_created_idx` ON `mcp_tool_operations` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `oauthAccessToken_clientId_idx` ON `oauth_access_token` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauthAccessToken_sessionId_idx` ON `oauth_access_token` (`session_id`);--> statement-breakpoint
CREATE INDEX `oauthAccessToken_userId_idx` ON `oauth_access_token` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauthAccessToken_authorizationCodeId_idx` ON `oauth_access_token` (`authorization_code_id`);--> statement-breakpoint
CREATE INDEX `oauthAccessToken_refreshId_idx` ON `oauth_access_token` (`refresh_id`);--> statement-breakpoint
CREATE INDEX `oauthClient_userId_idx` ON `oauth_client` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `oauthClientResource_clientId_resourceId_uidx` ON `oauth_client_resource` (`client_id`,`resource_id`);--> statement-breakpoint
CREATE INDEX `oauthClientResource_clientId_idx` ON `oauth_client_resource` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauthClientResource_resourceId_idx` ON `oauth_client_resource` (`resource_id`);--> statement-breakpoint
CREATE INDEX `oauthConsent_clientId_idx` ON `oauth_consent` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauthConsent_userId_idx` ON `oauth_consent` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauthRefreshToken_clientId_idx` ON `oauth_refresh_token` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauthRefreshToken_sessionId_idx` ON `oauth_refresh_token` (`session_id`);--> statement-breakpoint
CREATE INDEX `oauthRefreshToken_userId_idx` ON `oauth_refresh_token` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauthRefreshToken_authorizationCodeId_idx` ON `oauth_refresh_token` (`authorization_code_id`);
--> statement-breakpoint
INSERT INTO `agent_model_prices` (
  `id`,
  `provider`,
  `model`,
  `pricing_version`,
  `effective_from`,
  `effective_to`,
  `input_price_micros_per_million`,
  `cache_read_price_micros_per_million`,
  `cache_write_price_micros_per_million`,
  `output_price_micros_per_million`,
  `tier_threshold_token_count`,
  `tier_input_price_micros_per_million`,
  `tier_cache_read_price_micros_per_million`,
  `tier_cache_write_price_micros_per_million`,
  `tier_output_price_micros_per_million`,
  `currency`
) VALUES (
  'price_openrouter_gpt_5_6_luna_2026_08_01',
  'openrouter',
  'openai/gpt-5.6-luna',
  'openai-2026-08-01',
  1785510000000,
  NULL,
  200000,
  20000,
  250000,
  1200000,
  272000,
  400000,
  40000,
  500000,
  1800000,
  'USD'
);
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
END;
--> statement-breakpoint
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
CREATE TRIGGER `issues_revision_guard`
BEFORE UPDATE OF `revision` ON `issues`
FOR EACH ROW
WHEN NEW.`revision` != OLD.`revision`
  AND NEW.`revision` != OLD.`revision` + 1
BEGIN
  SELECT RAISE(ABORT, 'issue_revision_must_increment_by_one');
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
CREATE TRIGGER `storage_objects_before_delete_clear_agent_run_assets`
BEFORE DELETE ON `storage_objects`
BEGIN
	UPDATE `agent_run_assets`
	SET `storage_object_id` = NULL
	WHERE `organization_id` = OLD.`organization_id`
		AND `storage_object_id` = OLD.`id`;
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
