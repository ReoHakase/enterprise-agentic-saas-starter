import { agentClientToolNames } from "@enterprise-agentic-saas/agent-contracts"

export type PendingChatSubmission = {
  id: string
  fingerprint: string
}

export const resolveAgentSubmissionIdentity = (
  previous: PendingChatSubmission | undefined,
  fingerprint: string,
  createId: () => string
) => {
  const retrying = previous?.fingerprint === fingerprint
  const id = retrying ? previous.id : createId()
  return {
    id,
    retrying,
    pending: { id, fingerprint } satisfies PendingChatSubmission,
  }
}

export const shouldRetainAgentSubmission = (input: {
  isAbort: boolean
  isDisconnect: boolean
  isError: boolean
}) => input.isDisconnect || input.isError

const clientToolNames = new Set<string>(agentClientToolNames)

export const shouldAutoContinueAgentClientTools = (input: {
  messages: Array<{
    role: string
    parts: Array<{
      type: string
      state?: string
      toolName?: string
      providerExecuted?: boolean
    }>
  }>
}) => {
  const message = input.messages.at(-1)
  if (!message || message.role !== "assistant") return false
  const lastStepStart = message.parts.findLastIndex(
    (part) => part.type === "step-start"
  )
  const toolParts = message.parts
    .slice(lastStepStart + 1)
    .filter(
      (part) => part.type === "dynamic-tool" || part.type.startsWith("tool-")
    )
  return (
    toolParts.length > 0 &&
    toolParts.every((part) => {
      const toolName =
        part.type === "dynamic-tool"
          ? part.toolName
          : part.type.slice("tool-".length)
      return (
        part.providerExecuted !== true &&
        typeof toolName === "string" &&
        clientToolNames.has(toolName) &&
        part.state === "output-available"
      )
    })
  )
}
