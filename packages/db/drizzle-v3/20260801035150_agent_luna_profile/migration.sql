ALTER TABLE `agent_runs` ALTER COLUMN "model_profile_id" TO "model_profile_id" text NOT NULL DEFAULT 'openrouter-gpt-5.6-luna-xhigh';--> statement-breakpoint
ALTER TABLE `agent_runs` ALTER COLUMN "context_window_token_count" TO "context_window_token_count" integer NOT NULL DEFAULT 1050000;
