import type { Db } from "@enterprise-agentic-saas/db"

import type {
  AgentUiMessage,
  AgentClientToolResult,
} from "../../../agent-client"
import { createAgentToken, hashAgentToken } from "../crypto"
import {
  requireActiveMembership,
  requireLiveSession,
  requireOwnedThread,
} from "./auth-repository"
import { preserveAgentError } from "./repository-support"
import { issueConnectionTicketInTransaction } from "./thread-repository"

export const prepareAgentClientToolContinuationForSession = async (
  db: Db,
  input: {
    assistantMessageId: string
    clientToolResults: AgentClientToolResult[]
    sessionId: string
    threadId: string
    timezone: string
    userId: string
    now?: Date
  }
) => {
  const sortedCallIds = input.clientToolResults
    .map((result) => result.toolCallId)
    .toSorted()
  const clientMessageId = `continuation_${(
    await hashAgentToken(
      `${input.assistantMessageId}\u0000${sortedCallIds.join("\u0000")}`
    )
  ).slice(0, 64)}`
  const credential = await createAgentToken()
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const current = await requireLiveSession(tx, { ...input, now })
      await requireActiveMembership(tx, current)
      const thread = await requireOwnedThread(tx, {
        threadId: input.threadId,
        userId: input.userId,
        activeOrganizationId: current.activeOrganizationId,
      })
      const message: AgentUiMessage = {
        id: input.assistantMessageId,
        role: "assistant",
        parts: input.clientToolResults.map((result) =>
          result.state === "output-available"
            ? {
                type: `tool-${result.toolName}` as const,
                toolCallId: result.toolCallId,
                state: result.state,
                input: result.input,
                output: result.output,
              }
            : {
                type: `tool-${result.toolName}` as const,
                toolCallId: result.toolCallId,
                state: result.state,
                input: result.input,
                errorText: result.errorText,
              }
        ),
      }
      const connection = await issueConnectionTicketInTransaction(tx, {
        credential,
        current,
        now,
        sessionId: input.sessionId,
        threadId: thread.id,
        userId: input.userId,
      })
      return {
        ...connection,
        assetIds: [],
        contextReferences: [],
        clientMessageId,
        messages: [message],
        threadId: thread.id,
        timezone: input.timezone,
        trigger: "client_tool_result" as const,
      }
    })
  } catch (cause) {
    return preserveAgentError(
      cause,
      "prepareAgentClientToolContinuationForSession"
    )
  }
}
