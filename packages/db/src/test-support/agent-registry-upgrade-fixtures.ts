export const retainedAgentRegistryTables = [
  "agent_runs",
  "agent_connection_tickets",
  "agent_grants",
  "agent_approval_policies",
  "agent_thread_permissions",
  "agent_usage_events",
  "agent_actions",
  "agent_assets",
  "agent_run_assets",
  "agent_action_assets",
  "agent_resume_tickets",
  "storage_object_claims",
] as const

export const removedAgentHistoryTables = [
  "agent_messages",
  "agent_thread_context_summaries",
] as const

export const retainedAgentRegistryTriggers = [
  "agent_actions_scope_insert",
  "agent_approval_policies_scope_insert",
] as const
