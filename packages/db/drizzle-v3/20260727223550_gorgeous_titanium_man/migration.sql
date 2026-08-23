ALTER TABLE `agent_connection_tickets` ADD `web_search_query_hash` text;--> statement-breakpoint
ALTER TABLE `agent_grants` ADD `web_search_query_hash` text;--> statement-breakpoint
ALTER TABLE `agent_runs` ADD `web_search_query_hash` text;