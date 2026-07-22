const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const issueActionKindByTool = new Map([
  ["create_issue", "create_issue"],
  ["delete_issue", "delete_issue"],
  ["update_issue", "update_issue"],
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const isPendingIssueActionResult = (value: unknown): boolean => {
  if (!isRecord(value)) return false
  const toolName = value.toolName
  if (typeof toolName !== "string") return false
  const expectedKind = issueActionKindByTool.get(toolName)
  if (expectedKind === undefined) return false

  const output = value.output
  if (!isRecord(output)) return false
  const preview = output.preview
  return (
    output.status === "pending" &&
    output.requiresApproval === true &&
    typeof output.actionId === "string" &&
    IDENTIFIER_PATTERN.test(output.actionId) &&
    typeof output.expiresAt === "string" &&
    output.expiresAt.length <= 64 &&
    isRecord(preview) &&
    preview.kind === expectedKind
  )
}

export const stopOnPendingIssueAction = ({
  steps,
}: {
  steps: readonly { toolResults: readonly unknown[] }[]
}): boolean =>
  steps.at(-1)?.toolResults.some(isPendingIssueActionResult) ?? false
