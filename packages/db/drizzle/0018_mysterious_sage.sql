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
	`currency` text DEFAULT 'USD' NOT NULL,
	CONSTRAINT "agent_model_prices_values_check" CHECK(length("agent_model_prices"."provider") between 1 and 64
        and length("agent_model_prices"."model") between 1 and 160
        and length("agent_model_prices"."pricing_version") between 1 and 160
        and ("agent_model_prices"."effective_to" is null or "agent_model_prices"."effective_to" > "agent_model_prices"."effective_from")
        and "agent_model_prices"."input_price_micros_per_million" >= 0
        and "agent_model_prices"."cache_read_price_micros_per_million" >= 0
        and "agent_model_prices"."cache_write_price_micros_per_million" >= 0
        and "agent_model_prices"."output_price_micros_per_million" >= 0
        and "agent_model_prices"."currency" = 'USD')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_model_prices_version_uidx` ON `agent_model_prices` (`provider`,`model`,`pricing_version`);--> statement-breakpoint
CREATE INDEX `agent_model_prices_effective_idx` ON `agent_model_prices` (`provider`,`model`,`effective_from`);--> statement-breakpoint
INSERT OR IGNORE INTO `agent_model_prices` (`id`, `provider`, `model`, `pricing_version`, `effective_from`, `input_price_micros_per_million`, `cache_read_price_micros_per_million`, `cache_write_price_micros_per_million`, `output_price_micros_per_million`, `currency`)
VALUES ('openrouter-qwen3.6-flash-2026-07-22', 'openrouter', 'qwen/qwen3.6-flash', 'openrouter-alibaba-2026-07-22', 1784678400000, 187500, 46875, 234375, 1125000, 'USD');--> statement-breakpoint
CREATE TABLE `agent_thread_context_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`through_sequence` integer NOT NULL,
	`summary` text NOT NULL,
	`estimated_token_count` integer NOT NULL,
	`model` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`thread_id`) REFERENCES `agent_threads`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_thread_context_summaries_content_check" CHECK("agent_thread_context_summaries"."through_sequence" >= 1
        and length("agent_thread_context_summaries"."summary") between 1 and 50000
        and "agent_thread_context_summaries"."estimated_token_count" >= 1
        and length("agent_thread_context_summaries"."model") between 1 and 160)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_thread_context_summaries_scope_uidx` ON `agent_thread_context_summaries` (`organization_id`,`thread_id`,`through_sequence`);--> statement-breakpoint
CREATE INDEX `agent_thread_context_summaries_latest_idx` ON `agent_thread_context_summaries` (`organization_id`,`thread_id`,`created_at`);--> statement-breakpoint
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
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_usage_daily_values_check" CHECK("agent_usage_daily"."date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        and length("agent_usage_daily"."provider") between 1 and 64
        and length("agent_usage_daily"."model") between 1 and 160
        and "agent_usage_daily"."run_count" >= 0
        and "agent_usage_daily"."input_token_count" >= 0
        and "agent_usage_daily"."output_token_count" >= 0
        and "agent_usage_daily"."reasoning_token_count" >= 0
        and "agent_usage_daily"."total_token_count" = "agent_usage_daily"."input_token_count" + "agent_usage_daily"."output_token_count"
        and "agent_usage_daily"."cost_micros" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_usage_daily_scope_uidx` ON `agent_usage_daily` (`date`,`organization_id`,`user_id`,`provider`,`model`);--> statement-breakpoint
CREATE INDEX `agent_usage_daily_organization_date_idx` ON `agent_usage_daily` (`organization_id`,`date`);--> statement-breakpoint
ALTER TABLE `agent_runs` ADD `model_profile_id` text DEFAULT 'openrouter-qwen3.6-flash' NOT NULL;--> statement-breakpoint
ALTER TABLE `agent_runs` ADD `context_window_token_count` integer DEFAULT 1000000 NOT NULL CHECK (`context_window_token_count` >= 1);--> statement-breakpoint
ALTER TABLE `agent_runs` ADD `estimated_input_token_count` integer DEFAULT 0 NOT NULL CHECK (`estimated_input_token_count` >= 0);--> statement-breakpoint
ALTER TABLE `agent_runs` ADD `reserved_output_token_count` integer DEFAULT 4096 NOT NULL CHECK (`reserved_output_token_count` >= 1);--> statement-breakpoint
CREATE TABLE `__new_agent_usage_events` (
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
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`run_id`,`thread_id`) REFERENCES `agent_runs`(`organization_id`,`id`,`thread_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_usage_events_provider_check" CHECK(length("__new_agent_usage_events"."provider") between 1 and 64),
	CONSTRAINT "agent_usage_events_model_check" CHECK(length("__new_agent_usage_events"."model") between 1 and 160),
	CONSTRAINT "agent_usage_events_counts_check" CHECK("__new_agent_usage_events"."input_token_count" >= 0
        and "__new_agent_usage_events"."input_no_cache_token_count" >= 0
        and "__new_agent_usage_events"."cache_read_token_count" >= 0
        and "__new_agent_usage_events"."cache_write_token_count" >= 0
        and "__new_agent_usage_events"."output_token_count" >= 0
        and "__new_agent_usage_events"."text_output_token_count" >= 0
        and "__new_agent_usage_events"."reasoning_token_count" >= 0
        and "__new_agent_usage_events"."total_token_count" >= 0
        and "__new_agent_usage_events"."image_input_count" >= 0
        and "__new_agent_usage_events"."calculated_cost_micros" >= 0
        and ("__new_agent_usage_events"."provider_cost_micros" is null or "__new_agent_usage_events"."provider_cost_micros" >= 0)
        and "__new_agent_usage_events"."duration_ms" between 0 and 300000),
	CONSTRAINT "agent_usage_events_token_shape_check" CHECK("__new_agent_usage_events"."input_no_cache_token_count" + "__new_agent_usage_events"."cache_read_token_count" + "__new_agent_usage_events"."cache_write_token_count" <= "__new_agent_usage_events"."input_token_count"
        and "__new_agent_usage_events"."text_output_token_count" + "__new_agent_usage_events"."reasoning_token_count" <= "__new_agent_usage_events"."output_token_count"
        and "__new_agent_usage_events"."total_token_count" = "__new_agent_usage_events"."input_token_count" + "__new_agent_usage_events"."output_token_count"),
	CONSTRAINT "agent_usage_events_billing_check" CHECK(length("__new_agent_usage_events"."pricing_version") between 1 and 160
        and "__new_agent_usage_events"."currency" = 'USD'),
	CONSTRAINT "agent_usage_events_idempotency_check" CHECK((
        "__new_agent_usage_events"."provider_request_id" is not null
        and length("__new_agent_usage_events"."provider_request_id") between 1 and 160
      ) or (
        "__new_agent_usage_events"."run_event_id" is not null
        and length("__new_agent_usage_events"."run_event_id") between 1 and 160
      ))
);
--> statement-breakpoint
INSERT INTO `__new_agent_usage_events`("id", "organization_id", "thread_id", "run_id", "user_id", "provider", "model", "input_token_count", "input_no_cache_token_count", "cache_read_token_count", "cache_write_token_count", "output_token_count", "text_output_token_count", "reasoning_token_count", "total_token_count", "image_input_count", "calculated_cost_micros", "provider_cost_micros", "pricing_version", "currency", "is_estimate", "duration_ms", "provider_request_id", "run_event_id", "created_at") SELECT "id", "organization_id", "thread_id", "run_id", (SELECT "user_id" FROM `agent_runs` WHERE `agent_runs`.`organization_id` = `agent_usage_events`.`organization_id` AND `agent_runs`.`id` = `agent_usage_events`.`run_id`), "provider", "model", "input_token_count", "input_token_count", 0, 0, "output_token_count", "output_token_count", 0, "input_token_count" + "output_token_count", 0, 0, NULL, 'unpriced', 'USD', true, "duration_ms", "provider_request_id", "run_event_id", "created_at" FROM `agent_usage_events`;--> statement-breakpoint
DROP TABLE `agent_usage_events`;--> statement-breakpoint
ALTER TABLE `__new_agent_usage_events` RENAME TO `agent_usage_events`;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_usage_events_provider_request_uidx` ON `agent_usage_events` (`organization_id`,`provider`,`provider_request_id`) WHERE "agent_usage_events"."provider_request_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_usage_events_run_event_uidx` ON `agent_usage_events` (`organization_id`,`run_id`,`run_event_id`) WHERE "agent_usage_events"."run_event_id" is not null;--> statement-breakpoint
CREATE INDEX `agent_usage_events_run_created_idx` ON `agent_usage_events` (`organization_id`,`run_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `agent_threads` ADD `title_state` text DEFAULT 'untitled' NOT NULL CHECK (`title_state` IN ('untitled', 'agent'));--> statement-breakpoint
UPDATE `agent_threads`
SET `title_state` = CASE
	WHEN `title` = 'New conversation' THEN 'untitled'
	ELSE 'agent'
END;
