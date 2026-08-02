UPDATE `member` SET `role` = 'owner' WHERE `role` = 'super_admin';--> statement-breakpoint
DROP TABLE `invitation_email_jobs`;--> statement-breakpoint
DROP INDEX `member_organization_super_admin_uidx`;--> statement-breakpoint
CREATE UNIQUE INDEX `member_organization_owner_uidx` ON `member` (`organization_id`) WHERE "member"."role" = 'owner';
