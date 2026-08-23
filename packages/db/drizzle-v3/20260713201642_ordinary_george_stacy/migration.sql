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
	CONSTRAINT "organization_deletion_jobs_status_check" CHECK("organization_deletion_jobs"."status" in ('pending', 'processing', 'failed', 'completed')),
	CONSTRAINT "organization_deletion_jobs_attempts_check" CHECK("organization_deletion_jobs"."attempts" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_deletion_jobs_request_uidx` ON `organization_deletion_jobs` (`requested_by_user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `organization_deletion_jobs_organization_idx` ON `organization_deletion_jobs` (`organization_id`);--> statement-breakpoint
CREATE INDEX `organization_deletion_jobs_retry_idx` ON `organization_deletion_jobs` (`status`,`next_attempt_at`,`requested_at`);