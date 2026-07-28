const agentEvalRuntimeToolNames = [
  "add_issue_attachments",
  "create_issue",
  "delete_issue",
  "get_issue",
  "read_account_context",
  "read_active_organization",
  "read_issue_attachment_image",
  "remove_issue_attachments",
  "search_issue_labels",
  "search_issues",
  "search_organization_members",
  "update_issue",
  "web_search",
] as const

export type AgentEvalRuntimeToolName =
  (typeof agentEvalRuntimeToolNames)[number]

const knownToolNames: ReadonlySet<string> = new Set(agentEvalRuntimeToolNames)

const isKnownToolName = (value: unknown): value is AgentEvalRuntimeToolName =>
  typeof value === "string" && knownToolNames.has(value)

const invalidAllowlist = (): never => {
  throw new Error("Invalid Agent eval tool allowlist")
}

export const parseAgentEvalToolAllowlist = (
  serialized: string
): readonly AgentEvalRuntimeToolName[] => {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    return invalidAllowlist()
  }
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every(isKnownToolName) ||
    new Set(value).size !== value.length
  ) {
    return invalidAllowlist()
  }
  return value
}
