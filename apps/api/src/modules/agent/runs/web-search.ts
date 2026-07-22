import type { Db } from "@enterprise-agentic-saas/db"
import { member, user } from "@enterprise-agentic-saas/db/schema"
import { eq } from "drizzle-orm"

import type { AgentWebSearchReservation } from "../../../agent-client"
import { AppError, publicErrors } from "../../../errors/app-error"
import { hashAgentToken } from "../crypto"
import { validateGrantInTransaction } from "../threads/repository"
import { reserveAgentWebSearchInTransaction } from "../usage/resource-limits"

const normalizeSearchText = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("en-US")

/**
 * 検索providerへ送る直前のqueryを、run capabilityと現在のtenant memberに照らして検査する。
 * queryや一致した文字列はerror/logへ含めない。
 */
export const guardAgentWebSearchQuery = async (
  db: Db,
  input: { grant: string; query: string; now?: Date }
): Promise<{ query: string }> => {
  const tokenHash = await hashAgentToken(input.grant)
  try {
    return await db.transaction(async (tx) => {
      const context = await validateGrantInTransaction(tx, {
        tokenHash,
        kind: "run",
        now: input.now ?? new Date(),
      })
      if (context.runScope !== "chat" || context.runStatus !== "running") {
        throw publicErrors.conflict("Agent run cannot use web search", {
          reason: "run_not_searchable",
          resource: "agent_run",
        })
      }
      const identities = await tx
        .select({ email: user.email, name: user.name })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(eq(member.organizationId, context.organizationId))
      const normalizedQuery = normalizeSearchText(input.query)
      const containsKnownIdentity = identities.some(({ email, name }) => {
        const normalizedEmail = normalizeSearchText(email).trim()
        const normalizedName = normalizeSearchText(name).trim()
        return (
          (normalizedEmail.length >= 3 &&
            normalizedQuery.includes(normalizedEmail)) ||
          (normalizedName.length >= 2 &&
            normalizedQuery.includes(normalizedName))
        )
      })
      if (containsKnownIdentity) {
        throw publicErrors.validation("Web search query is not public")
      }
      return { query: input.query }
    })
  } catch (cause) {
    if (cause instanceof AppError) throw cause
    throw publicErrors.internal(undefined, {
      module: "agent-web-search-guard",
      operation: "guardAgentWebSearchQuery",
    })
  }
}

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
