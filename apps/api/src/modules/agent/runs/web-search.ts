import type { Db } from "@enterprise-agentic-saas/db"
import {
  agentMessages,
  agentRuns,
  agentThreads,
  issues,
  member,
  organization,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { and, desc, eq } from "drizzle-orm"

import type { AgentWebSearchReservation } from "../../../agent-client"
import { AppError, publicErrors } from "../../../errors/app-error"
import { hashAgentToken } from "../crypto"
import { validateGrantInTransaction } from "../threads/repository"
import { reserveAgentWebSearchInTransaction } from "../usage/resource-limits"

const normalizeSearchText = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/gu, " ")
    .trim()

const MAXIMUM_PRIVATE_CONTEXT_CHARACTERS = 1_000_000
const MAXIMUM_PRIVATE_IDENTITIES = 500
const MAXIMUM_PRIVATE_ISSUES = 200
const MAXIMUM_PRIVATE_MESSAGES = 200
const publicOnlyRestatementPatterns = [
  /^public-only web query\s*:\s*(.{2,200})$/iu,
  /^公開情報だけのweb検索\s*[:：]\s*(.{2,200})$/iu,
] as const

const forbiddenServerQueryPatterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
  /(?:^|\s)\+?\d[\d ()-]{7,}\d(?:\s|$)/u,
  /〒?\s*\d{3}-\d{4}/u,
  /\b\d{1,6}\s+[A-Za-z0-9.' -]{2,50}\s+(?:street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr|way)\b/iu,
  /\b(?:sk-or-v1|sk-proj|sk-live|sk-test|gh[pousr]|xox[baprs])[-_][A-Za-z0-9_-]{8,}\b/iu,
  /\bAKIA[A-Z0-9]{16}\b/u,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/u,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/iu,
  /\b(?:authorization|proxy-authorization|cookie|set-cookie)\s*:/iu,
  /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|passwd|secret|session[_ -]?token)\s*[:=]\s*\S+/iu,
  /\b(?:organization|org|issue|user|member|asset|thread|session|run|action)(?:[_ -]?id)?\s*[:=#/]\s*[A-Za-z0-9_-]{4,}\b/iu,
  /\b(?:org|issue|user|member|asset|thread|session|run|action)_[A-Za-z0-9_-]{8,}\b/iu,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu,
  /\b(?:localhost|[A-Za-z0-9.-]+\.(?:local|internal|invalid|test))(?::\d{1,5})?\b/iu,
  /\b(?:127\.\d{1,3}\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/u,
  /\b(?:private issue|internal note|customer data|tenant data|confidential data)\s*[:=]/iu,
] as const

const containsControlCharacter = (value: string) =>
  /[\p{Cc}\p{Cf}]/u.test(value)

const hasForbiddenServerQueryShape = (query: string) =>
  containsControlCharacter(query) ||
  forbiddenServerQueryPatterns.some((pattern) => pattern.test(query))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const collectStrings = (
  value: unknown,
  output: string[],
  state: { characters: number },
  depth = 0
): boolean => {
  if (typeof value === "string") {
    state.characters += value.length
    if (state.characters > MAXIMUM_PRIVATE_CONTEXT_CHARACTERS) return false
    output.push(value)
    return true
  }
  if (value === null || typeof value !== "object") return true
  if (depth >= 8) return false
  if (Array.isArray(value)) {
    return value.every((item) => collectStrings(item, output, state, depth + 1))
  }
  for (const nested of Object.values(value)) {
    if (!collectStrings(nested, output, state, depth + 1)) return false
  }
  return true
}

const normalizedPrivateValues = (
  values: readonly string[],
  minimumLength = 3
) =>
  values
    .map(normalizeSearchText)
    .filter((value) => value.length >= minimumLength)

const containsCompletePrivateValue = (
  normalizedQuery: string,
  values: readonly string[]
) => values.some((value) => normalizedQuery.includes(value))

const queryWords = (value: string) =>
  new Set(
    value
      .match(/[\p{L}\p{N}][\p{L}\p{N}._-]*/gu)
      ?.map((word) => word.toLocaleLowerCase("en-US"))
      .filter((word) => word.length >= 4) ?? []
  )

const overlapsPrivateContext = (
  normalizedQuery: string,
  values: readonly string[]
) => {
  const words = queryWords(normalizedQuery)
  if (words.size === 0) return false
  return values.some((value) => {
    if (value.includes(normalizedQuery) && normalizedQuery.length >= 6) {
      return true
    }
    const privateWords = queryWords(value)
    return [...words].some((word) => privateWords.has(word))
  })
}

const contextReferenceStrings = (content: unknown): string[] => {
  if (!isRecord(content) || !Array.isArray(content.parts)) return []
  const values: string[] = []
  for (const part of content.parts) {
    if (
      !isRecord(part) ||
      part.type !== "data-context-reference" ||
      !isRecord(part.data)
    ) {
      continue
    }
    if (typeof part.data.label === "string") values.push(part.data.label)
    if (typeof part.data.path === "string") values.push(part.data.path)
  }
  return values
}

const publicOnlyRestatement = (content: unknown): string | null => {
  if (!isRecord(content) || !Array.isArray(content.parts)) return null
  const candidates: string[] = []
  for (const part of content.parts) {
    if (
      !isRecord(part) ||
      part.type !== "text" ||
      typeof part.text !== "string"
    )
      continue
    for (const line of part.text.split(/\r?\n/u)) {
      for (const pattern of publicOnlyRestatementPatterns) {
        const candidate = line.trim().match(pattern)?.[1]?.trim()
        if (candidate) candidates.push(candidate)
      }
    }
  }
  return candidates.length === 1 ? (candidates[0] ?? null) : null
}

const assertPrivateContextWithinBounds = (input: {
  identityCount: number
  issueCount: number
  messageCount: number
}) => {
  if (
    input.identityCount > MAXIMUM_PRIVATE_IDENTITIES ||
    input.issueCount > MAXIMUM_PRIVATE_ISSUES ||
    input.messageCount > MAXIMUM_PRIVATE_MESSAGES
  ) {
    throw publicErrors.validation("Web search private context is too large")
  }
}

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
      if (!context.runId || hasForbiddenServerQueryShape(input.query)) {
        throw publicErrors.validation("Web search query is not public")
      }
      const runRows = await tx
        .select({
          clientMessageId: agentRuns.clientMessageId,
          userId: agentRuns.userId,
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
      const currentRun = runRows[0]
      if (
        !currentRun?.clientMessageId ||
        currentRun.userId !== context.userId
      ) {
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
        .limit(MAXIMUM_PRIVATE_IDENTITIES + 1)
      const normalizedQuery = normalizeSearchText(input.query)
      const organizationRows = await tx
        .select({ name: organization.name, slug: organization.slug })
        .from(organization)
        .where(eq(organization.id, context.organizationId))
        .limit(1)
      const threadRows = await tx
        .select({ title: agentThreads.title })
        .from(agentThreads)
        .where(
          and(
            eq(agentThreads.id, context.threadId),
            eq(agentThreads.organizationId, context.organizationId)
          )
        )
        .limit(1)
      const issueRows = await tx
        .select({
          description: issues.description,
          labels: issues.labels,
          title: issues.title,
        })
        .from(issues)
        .where(eq(issues.organizationId, context.organizationId))
        .limit(MAXIMUM_PRIVATE_ISSUES + 1)
      const messageRows = await tx
        .select({
          clientMessageId: agentMessages.clientMessageId,
          content: agentMessages.content,
        })
        .from(agentMessages)
        .where(
          and(
            eq(agentMessages.organizationId, context.organizationId),
            eq(agentMessages.threadId, context.threadId)
          )
        )
        .orderBy(desc(agentMessages.sequence))
        .limit(MAXIMUM_PRIVATE_MESSAGES + 1)
      assertPrivateContextWithinBounds({
        identityCount: identities.length,
        issueCount: issueRows.length,
        messageCount: messageRows.length,
      })
      const currentMessage = messageRows.find(
        (message) => message.clientMessageId === currentRun.clientMessageId
      )
      if (!currentMessage) {
        throw publicErrors.conflict("Agent run cannot use web search", {
          reason: "run_not_searchable",
          resource: "agent_run",
        })
      }
      const identityValues = normalizedPrivateValues(
        identities.flatMap(({ email, name }) => [email, name]),
        2
      )
      const privateSourceValues: string[] = []
      const privateContextState = { characters: 0 }
      const appendPrivateSource = (value: string) => {
        privateContextState.characters += value.length
        if (
          privateContextState.characters > MAXIMUM_PRIVATE_CONTEXT_CHARACTERS
        ) {
          throw publicErrors.validation(
            "Web search private context is too large"
          )
        }
        privateSourceValues.push(value)
      }
      for (const { email, name } of identities) {
        appendPrivateSource(email)
        appendPrivateSource(name)
      }
      for (const { name, slug } of organizationRows) {
        appendPrivateSource(name)
        appendPrivateSource(slug)
      }
      for (const { title } of threadRows) appendPrivateSource(title)
      for (const { description, labels, title } of issueRows) {
        appendPrivateSource(title)
        appendPrivateSource(description)
        for (const label of labels) appendPrivateSource(label)
      }
      for (const value of contextReferenceStrings(currentMessage.content)) {
        appendPrivateSource(value)
      }
      const privateValues = normalizedPrivateValues(privateSourceValues)
      if (
        containsCompletePrivateValue(normalizedQuery, identityValues) ||
        containsCompletePrivateValue(normalizedQuery, privateValues)
      ) {
        throw publicErrors.validation("Web search query is not public")
      }

      const historicalStrings: string[] = []
      for (const message of messageRows) {
        if (message.clientMessageId === currentRun.clientMessageId) continue
        if (
          !collectStrings(
            message.content,
            historicalStrings,
            privateContextState
          )
        ) {
          throw publicErrors.validation(
            "Web search private context is too large"
          )
        }
      }
      const ambiguousValues = [
        ...identityValues,
        ...privateValues,
        ...normalizedPrivateValues(historicalStrings),
      ]
      if (overlapsPrivateContext(normalizedQuery, ambiguousValues)) {
        throw publicErrors.validation(
          "Web search query requires a public-only restatement"
        )
      }
      const authoritativePublicQuery = publicOnlyRestatement(
        currentMessage.content
      )
      if (
        !authoritativePublicQuery ||
        normalizeSearchText(authoritativePublicQuery) !== normalizedQuery
      ) {
        throw publicErrors.validation(
          "Web search query requires a public-only restatement"
        )
      }
      return { query: authoritativePublicQuery }
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
