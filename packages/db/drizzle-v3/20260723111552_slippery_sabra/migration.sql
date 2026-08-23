CREATE TABLE `issue_thumbnail_selections` (
	`organization_id` text NOT NULL,
	`issue_id` text NOT NULL,
	`file_id` text NOT NULL,
	PRIMARY KEY(`issue_id`, `organization_id`),
	FOREIGN KEY (`issue_id`,`organization_id`) REFERENCES `issues`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`,`organization_id`,`issue_id`) REFERENCES `issue_file_owners`(`file_id`,`organization_id`,`issue_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `issue_file_owners_file_organization_issue_uidx` ON `issue_file_owners` (`file_id`,`organization_id`,`issue_id`);