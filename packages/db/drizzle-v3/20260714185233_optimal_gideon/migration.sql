CREATE TABLE `invitation_email_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`invitation_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`locked_at` integer,
	`next_attempt_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`invitation_id`) REFERENCES `invitation`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "invitation_email_jobs_status_check" CHECK("invitation_email_jobs"."status" in ('pending', 'processing', 'failed', 'completed', 'canceled')),
	CONSTRAINT "invitation_email_jobs_attempts_check" CHECK("invitation_email_jobs"."attempts" >= 0),
	CONSTRAINT "invitation_email_jobs_last_error_code_check" CHECK("invitation_email_jobs"."last_error_code" is null or (
        length("invitation_email_jobs"."last_error_code") between 1 and 96
        and "invitation_email_jobs"."last_error_code" glob '[A-Za-z]*'
        and "invitation_email_jobs"."last_error_code" not glob '*[^A-Za-z0-9_.:-]*'
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_email_jobs_invitation_uidx` ON `invitation_email_jobs` (`invitation_id`);--> statement-breakpoint
CREATE INDEX `invitation_email_jobs_claim_idx` ON `invitation_email_jobs` (`status`,`next_attempt_at`,`created_at`);