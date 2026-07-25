import type { Db } from "@enterprise-agentic-saas/db"
import { agentMessages, agentThreads } from "@enterprise-agentic-saas/db/schema"
import { and, desc, eq } from "drizzle-orm"

import type {
  AgentCanonicalMessage,
  AgentCanonicalToolPart,
  AgentClientToolResult,
} from "../../../agent-client"
import { publicErrors } from "../../../errors/app-error"
import { createAgentToken, hashAgentToken } from "../crypto"
import {
  requireActiveMembership,
  requireLiveSession,
  requireOwnedThread,
} from "./auth-repository"
import {
  clientToolNames,
  listModelContextInTransaction,
  parseCanonicalMessage,
  preserveAgentError,
} from "./repository-support"
import { issueConnectionTicketInTransaction } from "./thread-repository"

const clientToolPartName = (
  part: AgentCanonicalMessage["parts"][number]
): string | undefined => {
  if (!part.type.startsWith("tool-")) return undefined
  const name = part.type.slice("tool-".length)
  return clientToolNames.has(name) ? name : undefined
}

const resultPart = (
  original: AgentCanonicalToolPart,
  result: AgentClientToolResult
): AgentCanonicalToolPart => ({
  type: original.type,
  toolCallId: original.toolCallId,
  state: result.state,
  ...(original.input === undefined ? {} : { input: original.input }),
  ...(result.state === "output-available"
    ? { output: result.output }
    : { errorText: result.errorText }),
})

const applyClientToolResults = (
  message: AgentCanonicalMessage & { role: "assistant" },
  results: AgentClientToolResult[]
): {
  changed: boolean
  message: AgentCanonicalMessage & { role: "assistant" }
} => {
  const byCallId = new Map(results.map((result) => [result.toolCallId, result]))
  let changed = false
  let matched = 0
  const parts = message.parts.map((part) => {
    const toolName = clientToolPartName(part)
    if (!toolName || !("toolCallId" in part)) return part
    const result = byCallId.get(part.toolCallId)
    if (!result) {
      if (part.state === "input-available") {
        throw publicErrors.validation("Missing client tool result")
      }
      return part
    }
    matched += 1
    if (result.toolName !== toolName) {
      throw publicErrors.validation("Client tool result does not match")
    }
    const next = resultPart(part, result)
    if (part.state === "input-available") {
      changed = true
      return next
    }
    if (
      (part.state !== "output-available" && part.state !== "output-error") ||
      JSON.stringify(part) !== JSON.stringify(next)
    ) {
      throw publicErrors.conflict("Client tool result changed", {
        reason: "idempotency_conflict",
        resource: "agent_message",
      })
    }
    return part
  })
  if (matched !== results.length) {
    throw publicErrors.validation("Unknown client tool result")
  }
  return {
    changed,
    message: parseCanonicalMessage({ ...message, parts }, "assistant"),
  }
}

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
      const rows = await tx
        .select()
        .from(agentMessages)
        .where(
          and(
            eq(agentMessages.organizationId, current.activeOrganizationId),
            eq(agentMessages.threadId, thread.id)
          )
        )
        .orderBy(desc(agentMessages.sequence))
        .limit(1)
      const row = rows[0]
      if (
        !row ||
        row.id !== input.assistantMessageId ||
        row.role !== "assistant"
      ) {
        throw publicErrors.conflict("Agent conversation changed", {
          resource: "agent_message",
        })
      }
      const canonical = parseCanonicalMessage(
        {
          id: row.id,
          role: row.role,
          parts: row.content.parts,
        },
        "assistant"
      )
      const applied = applyClientToolResults(canonical, input.clientToolResults)
      if (applied.changed) {
        const updated = await tx
          .update(agentMessages)
          .set({ content: { parts: applied.message.parts } })
          .where(
            and(
              eq(agentMessages.id, row.id),
              eq(agentMessages.organizationId, current.activeOrganizationId),
              eq(agentMessages.threadId, thread.id),
              eq(agentMessages.content, row.content)
            )
          )
          .returning({ id: agentMessages.id })
        if (!updated[0]) {
          throw publicErrors.conflict("Agent conversation changed", {
            resource: "agent_message",
          })
        }
      }
      await tx
        .update(agentThreads)
        .set({ updatedAt: now })
        .where(
          and(
            eq(agentThreads.organizationId, current.activeOrganizationId),
            eq(agentThreads.id, thread.id)
          )
        )
      const connection = await issueConnectionTicketInTransaction(tx, {
        credential,
        current,
        now,
        sessionId: input.sessionId,
        threadId: thread.id,
        userId: input.userId,
      })
      const messages = await listModelContextInTransaction(tx, {
        organizationId: current.activeOrganizationId,
        threadId: thread.id,
      })
      return {
        ...connection,
        assetIds: [],
        contextReferences: [],
        clientMessageId,
        messages,
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
