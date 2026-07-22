CREATE TABLE `agent_messages` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`organization_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`client_message_id` text,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`thread_id`) REFERENCES `agent_threads`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_messages_role_check" CHECK("agent_messages"."role" in ('user', 'assistant')),
	CONSTRAINT "agent_messages_client_id_check" CHECK((
        "agent_messages"."role" = 'user'
        and length("agent_messages"."client_message_id") between 1 and 128
      ) or (
        "agent_messages"."role" = 'assistant'
        and "agent_messages"."client_message_id" is null
      )),
	CONSTRAINT "agent_messages_content_check" CHECK(json_valid("agent_messages"."content") and length("agent_messages"."content") between 2 and 131072)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_messages_id_uidx` ON `agent_messages` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_messages_thread_client_message_uidx` ON `agent_messages` (`organization_id`,`thread_id`,`client_message_id`) WHERE "agent_messages"."client_message_id" is not null;--> statement-breakpoint
CREATE INDEX `agent_messages_thread_sequence_idx` ON `agent_messages` (`organization_id`,`thread_id`,`sequence`);
