import {
  agentActionExecutionResultSchema,
  agentApprovalPolicySchema,
  agentAttachmentMutationReceiptSchema,
  agentContextRevocationSchema,
  agentIssueActionSchema,
  agentMessagePageSchema,
  agentRunResultSchema,
  agentThreadListSchema,
  agentThreadSchema,
  agentUiMessageListSchema,
  issueWriteToolOutputSchema,
  type AgentIssueAction,
  type AgentThread,
  type agentUiToolNames,
} from "@enterprise-agentic-saas/agent-contracts"
import type { UIMessage } from "ai"
import * as v from "valibot"

type AgentChatAssetData = {
  assetIds: string[]
  assets?: Array<{
    id: string
    filename: string
    sizeBytes: number
    imageWidth: number
    imageHeight: number
    expiresAt: string
  }>
}
export type AgentChatMessage = UIMessage<
  { runId?: string },
  {
    "agent-assets": AgentChatAssetData
    "context-reference":
      | { kind: "issue" | "file" | "member"; id: string; label: string }
      | { kind: "current_page"; path: string; label: string }
    run: { runId: string }
  },
  {
    [Name in (typeof agentUiToolNames)[number]]: {
      input: unknown
      output: unknown
    }
  }
>

export const parseAgentRunResult = (value: unknown) =>
  v.parse(agentRunResultSchema, value)

export const pendingActionToolOutputSchema =
  issueWriteToolOutputSchema.options[0]
export const attachmentMutationToolReceiptSchema =
  agentAttachmentMutationReceiptSchema

export type { AgentIssueAction, AgentThread }

export const parseAgentThreads = (value: unknown) =>
  v.parse(agentThreadListSchema, value)
const parseAgentMessages = (value: unknown): AgentChatMessage[] => {
  // transport schemaはJSON-safeなpartを保証し、このcloneではgeneric payloadもUIMessageに絞り込む。
  // oxlint-disable-next-line react-doctor/no-json-parse-stringify-clone
  const messages: AgentChatMessage[] = JSON.parse(
    JSON.stringify(v.parse(agentUiMessageListSchema, value))
  )
  return messages
}
export const parseAgentMessagePage = (value: unknown) => {
  const page = v.parse(agentMessagePageSchema, value)
  return {
    ...page,
    messages: parseAgentMessages(page.messages),
  }
}
export const parseAgentThread = (value: unknown) =>
  v.parse(agentThreadSchema, value)
export const parseAgentIssueAction = (value: unknown) =>
  v.parse(agentIssueActionSchema, value)
export const parseAgentActionExecutionResult = (value: unknown) =>
  v.parse(agentActionExecutionResultSchema, value)
export const parseAgentApprovalPolicy = (value: unknown) =>
  v.parse(agentApprovalPolicySchema, value)
export const parseAgentContextRevocation = (value: unknown) =>
  v.parse(agentContextRevocationSchema, value)
