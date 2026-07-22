import type { Db } from "@enterprise-agentic-saas/db"

import type { AgentWebSearchReservation } from "../../agent-client"
import { AppError, publicErrors } from "../../errors/app-error"
import { hashAgentToken } from "./crypto"
import { validateGrantInTransaction } from "./repository"
import { reserveAgentWebSearchInTransaction } from "./resource-usage-repository"

const isDatabaseWriteContention = (cause: unknown) => {
  const messages: string[] = []
  let current = cause
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) messages.push(current.message)
    if (typeof current !== "object") break
    current = Reflect.get(current, "cause")
  }
  const diagnostic = messages.join(" ")
  return (
    diagnostic.includes("SQLITE_BUSY") ||
    diagnostic.includes("SQLITE_LOCKED") ||
    diagnostic.includes("database is locked")
  )
}

/**
 * OpenRouterの検索providerを呼ぶ直前に使うprivate capability。
 * live run/tenantを再検証し、課金枠とrun markerを同じtransactionへ閉じる。
 */
export const reserveAgentWebSearch = async (
  db: Db,
  input: {
    grant: string
    now?: Date
    operationId: string
  }
): Promise<AgentWebSearchReservation> => {
  const tokenHash = await hashAgentToken(input.grant)
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const context = await validateGrantInTransaction(tx, {
        tokenHash,
        kind: "run",
        now,
      })
      if (
        !context.runId ||
        context.runStatus !== "running" ||
        context.runScope !== "chat" ||
        context.rootRunId !== context.runId
      ) {
        throw publicErrors.conflict("Agent run cannot use web search", {
          reason: "run_not_searchable",
          resource: "agent_run",
        })
      }
      const reservation = await reserveAgentWebSearchInTransaction(tx, {
        now,
        operationId: input.operationId,
        organizationId: context.organizationId,
        runId: context.runId,
        threadId: context.threadId,
        userId: context.userId,
      })
      return { reserved: true, reused: reservation.reused }
    })
  } catch (cause) {
    if (cause instanceof AppError) throw cause
    if (isDatabaseWriteContention(cause)) {
      throw new AppError({
        code: "rate_limited",
        publicMessage: "Web search reservation is temporarily busy. Try again",
        statusCode: 429,
        publicContext: {
          constraint: "web_search_transaction",
          reason: "concurrency_limit_exceeded",
          resource: "web_search",
          retryAfter: 1,
        },
        privateContext: {
          module: "agent-web-search-reservation",
          operation: "reserveAgentWebSearch",
        },
        cause,
      })
    }
    throw publicErrors.internal(cause, {
      module: "agent-web-search-reservation",
      operation: "reserveAgentWebSearch",
    })
  }
}
