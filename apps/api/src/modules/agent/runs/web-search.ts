import type { AgentWebSearchReservation } from "@enterprise-agentic-saas/agent-contracts"
import type { Db } from "@enterprise-agentic-saas/db"
import {
  agentRuns,
  issues,
  member,
  organization,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq } from "drizzle-orm"

import { HttpError } from "../../../errors/http-error"
import { hashAgentToken } from "../crypto"
import { validateGrantInTransaction } from "../threads/repository"
import { isRetryableDatabaseRace } from "../threads/repository-support"
import { reserveAgentWebSearchInTransaction } from "../usage/resource-limits"

const normalizeSearchText = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/gu, " ")
    .trim()

const forbiddenServerQueryPatterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
  /(?:^|\s)\+?\d[\d ()-]{7,}\d(?:\s|$)/u,
  /\b(?:sk-or-v1|sk-proj|sk-live|sk-test|gh[pousr]|xox[baprs])[-_][A-Za-z0-9_-]{8,}\b/iu,
  /\b(?:organization|org|issue|user|member|asset|thread|session|run|action)(?:[_ -]?id)?\s*[:=#/]\s*[A-Za-z0-9_-]{4,}\b/iu,
  /\b(?:org|issue|user|member|asset|thread|session|run|action)_[A-Za-z0-9_-]{8,}\b/iu,
  /\b(?:localhost|[A-Za-z0-9.-]+\.(?:local|internal|invalid|test))(?::\d{1,5})?\b/iu,
] as const

const queryContainsPrivateValue = (
  query: string,
  values: readonly string[]
): boolean => {
  const normalizedQuery = normalizeSearchText(query)
  return values.some((value) => {
    const normalized = normalizeSearchText(value)
    return normalized.length >= 2 && normalizedQuery.includes(normalized)
  })
}

export const guardAgentWebSearchQuery = async (
  db: Db,
  input: { grant: string; query: string; now?: Date }
): Promise<{ query: string }> => {
  const tokenHash = await hashAgentToken(input.grant)
  return db.transaction(async (tx) => {
    const context = await validateGrantInTransaction(tx, {
      tokenHash,
      kind: "run",
      now: input.now ?? new Date(),
    })
    if (
      !context.runId ||
      context.runScope !== "chat" ||
      context.runStatus !== "running" ||
      input.query.length < 2 ||
      input.query.length > 200 ||
      /[\p{Cc}\p{Cf}]/u.test(input.query) ||
      forbiddenServerQueryPatterns.some((pattern) => pattern.test(input.query))
    ) {
      throw new HttpError({ code: "validation_error" })
    }
    const runRows = await tx
      .select({
        clientMessageId: agentRuns.clientMessageId,
        userId: agentRuns.userId,
        webSearchQueryHash: agentRuns.webSearchQueryHash,
      })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.id, context.runId),
          eq(agentRuns.organizationId, context.organizationId),
          eq(agentRuns.threadId, context.threadId)
        )
      )
      .limit(1)
    const run = runRows[0]
    const expected = await hashAgentToken(`web-query\u0000${input.query}`)
    if (
      !run ||
      run.userId !== context.userId ||
      run.webSearchQueryHash !== expected
    ) {
      throw new HttpError({ code: "validation_error" })
    }

    const [identityRows, organizationRows, issueRows] = await Promise.all([
      tx
        .select({ email: user.email, name: user.name })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(eq(member.organizationId, context.organizationId))
        .limit(501),
      tx
        .select({ name: organization.name, slug: organization.slug })
        .from(organization)
        .where(eq(organization.id, context.organizationId))
        .limit(1),
      tx
        .select({
          description: issues.description,
          labels: issues.labels,
          title: issues.title,
        })
        .from(issues)
        .where(eq(issues.organizationId, context.organizationId))
        .limit(201),
    ])
    if (identityRows.length > 500 || issueRows.length > 200) {
      throw new HttpError({ code: "validation_error" })
    }
    const privateValues = [
      ...identityRows.flatMap(({ email, name }) => [email, name]),
      ...organizationRows.flatMap(({ name, slug }) => [name, slug]),
    ]
    for (const { description, labels, title } of issueRows) {
      privateValues.push(title, description, ...labels)
    }
    if (queryContainsPrivateValue(input.query, privateValues)) {
      throw new HttpError({ code: "validation_error" })
    }
    return { query: input.query }
  })
}

export const reserveAgentWebSearch = async (
  db: Db,
  input: { grant: string; now?: Date; operationId: string }
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
        throw new HttpError({ code: "conflict" })
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
    if (cause instanceof HttpError) throw cause
    if (isRetryableDatabaseRace(cause)) {
      throw new HttpError({
        code: "rate_limited",
        retryAfter: 1,
        cause,
      })
    }
    throw cause
  }
}
