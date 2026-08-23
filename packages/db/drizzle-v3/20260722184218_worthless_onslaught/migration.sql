PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent_model_prices` (
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
	CONSTRAINT "agent_model_prices_values_check" CHECK(length("__new_agent_model_prices"."provider") between 1 and 64
        and length("__new_agent_model_prices"."model") between 1 and 160
        and length("__new_agent_model_prices"."pricing_version") between 1 and 160
        and ("__new_agent_model_prices"."effective_to" is null or "__new_agent_model_prices"."effective_to" > "__new_agent_model_prices"."effective_from")
        and "__new_agent_model_prices"."input_price_micros_per_million" >= 0
        and "__new_agent_model_prices"."cache_read_price_micros_per_million" >= 0
        and "__new_agent_model_prices"."cache_write_price_micros_per_million" >= 0
        and "__new_agent_model_prices"."output_price_micros_per_million" >= 0
        and (
          ("__new_agent_model_prices"."tier_threshold_token_count" is null
            and "__new_agent_model_prices"."tier_input_price_micros_per_million" is null
            and "__new_agent_model_prices"."tier_cache_read_price_micros_per_million" is null
            and "__new_agent_model_prices"."tier_cache_write_price_micros_per_million" is null
            and "__new_agent_model_prices"."tier_output_price_micros_per_million" is null)
          or
          ("__new_agent_model_prices"."tier_threshold_token_count" >= 1
            and "__new_agent_model_prices"."tier_input_price_micros_per_million" >= 0
            and "__new_agent_model_prices"."tier_cache_read_price_micros_per_million" >= 0
            and "__new_agent_model_prices"."tier_cache_write_price_micros_per_million" >= 0
            and "__new_agent_model_prices"."tier_output_price_micros_per_million" >= 0)
        )
        and "__new_agent_model_prices"."currency" = 'USD')
);
--> statement-breakpoint
INSERT INTO `__new_agent_model_prices`("id", "provider", "model", "pricing_version", "effective_from", "effective_to", "input_price_micros_per_million", "cache_read_price_micros_per_million", "cache_write_price_micros_per_million", "output_price_micros_per_million", "tier_threshold_token_count", "tier_input_price_micros_per_million", "tier_cache_read_price_micros_per_million", "tier_cache_write_price_micros_per_million", "tier_output_price_micros_per_million", "currency") SELECT "id", "provider", "model", "pricing_version", "effective_from", "effective_to", "input_price_micros_per_million", "cache_read_price_micros_per_million", "cache_write_price_micros_per_million", "output_price_micros_per_million", NULL, NULL, NULL, NULL, NULL, "currency" FROM `agent_model_prices`;--> statement-breakpoint
DROP TABLE `agent_model_prices`;--> statement-breakpoint
ALTER TABLE `__new_agent_model_prices` RENAME TO `agent_model_prices`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_model_prices_version_uidx` ON `agent_model_prices` (`provider`,`model`,`pricing_version`);--> statement-breakpoint
CREATE INDEX `agent_model_prices_effective_idx` ON `agent_model_prices` (`provider`,`model`,`effective_from`);--> statement-breakpoint
UPDATE `agent_model_prices`
SET `effective_to` = 1784743200000
WHERE `provider` = 'openrouter'
  AND `model` = 'qwen/qwen3.6-flash'
  AND `effective_to` IS NULL;--> statement-breakpoint
INSERT INTO `agent_model_prices` (`id`, `provider`, `model`, `pricing_version`, `effective_from`, `effective_to`, `input_price_micros_per_million`, `cache_read_price_micros_per_million`, `cache_write_price_micros_per_million`, `output_price_micros_per_million`, `tier_threshold_token_count`, `tier_input_price_micros_per_million`, `tier_cache_read_price_micros_per_million`, `tier_cache_write_price_micros_per_million`, `tier_output_price_micros_per_million`, `currency`)
VALUES ('openrouter-qwen3.6-flash-2026-07-23', 'openrouter', 'qwen/qwen3.6-flash', 'openrouter-alibaba-tiered-2026-07-23', 1784743200000, NULL, 187500, 18750, 234375, 1125000, 256000, 750000, 75000, 937500, 3000000, 'USD');
