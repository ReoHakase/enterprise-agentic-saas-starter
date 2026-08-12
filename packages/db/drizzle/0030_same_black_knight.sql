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
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`storage_object_id`) REFERENCES `storage_objects`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "mcp_attachment_uploads_filename_check" CHECK(length("mcp_attachment_uploads"."filename") between 1 and 255),
	CONSTRAINT "mcp_attachment_uploads_status_check" CHECK("mcp_attachment_uploads"."status" in ('pending', 'ready', 'consumed', 'expired')),
	CONSTRAINT "mcp_attachment_uploads_expiry_check" CHECK("mcp_attachment_uploads"."expires_at" > "mcp_attachment_uploads"."created_at" and "mcp_attachment_uploads"."expires_at" <= "mcp_attachment_uploads"."created_at" + 900000),
	CONSTRAINT "mcp_attachment_uploads_consumed_at_check" CHECK(("mcp_attachment_uploads"."status" = 'consumed' and "mcp_attachment_uploads"."consumed_at" is not null) or ("mcp_attachment_uploads"."status" != 'consumed' and "mcp_attachment_uploads"."consumed_at" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_attachment_uploads_storage_object_uidx` ON `mcp_attachment_uploads` (`storage_object_id`);--> statement-breakpoint
CREATE INDEX `mcp_attachment_uploads_owner_status_idx` ON `mcp_attachment_uploads` (`organization_id`,`user_id`,`client_id`,`status`,`expires_at`);--> statement-breakpoint
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
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "mcp_tool_operations_tool_name_check" CHECK(length("mcp_tool_operations"."tool_name") between 1 and 96),
	CONSTRAINT "mcp_tool_operations_idempotency_key_check" CHECK(length("mcp_tool_operations"."idempotency_key") between 16 and 128),
	CONSTRAINT "mcp_tool_operations_payload_digest_check" CHECK(length("mcp_tool_operations"."payload_digest") = 64 and "mcp_tool_operations"."payload_digest" not glob '*[^0-9a-f]*'),
	CONSTRAINT "mcp_tool_operations_receipt_check" CHECK(json_valid("mcp_tool_operations"."receipt") and json_type("mcp_tool_operations"."receipt") = 'object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_tool_operations_idempotency_uidx` ON `mcp_tool_operations` (`organization_id`,`user_id`,`client_id`,`tool_name`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `mcp_tool_operations_created_idx` ON `mcp_tool_operations` (`organization_id`,`created_at`);