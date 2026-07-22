import type { Db } from "@enterprise-agentic-saas/db"
import {
  agentModelPrices,
  agentRuns,
  agentUsageDaily,
  agentUsageEvents,
} from "@enterprise-agentic-saas/db/schema"
import { and, desc, eq, gt, isNull, lt, lte, or, sql } from "drizzle-orm"

import type {
  AgentUsageRecordInput,
  AgentUsageRecordResult,
} from "../../../agent-client"
import { AppError, publicErrors } from "../../../errors/app-error"
import { hashAgentToken } from "../crypto"
import {
  requireActiveMembership,
  requireLiveSession,
  validateGrantInTransaction,
} from "../threads/repository"

const pricedMicros = (tokens: number, microsPerMillion: number) =>
  Math.ceil((tokens * microsPerMillion) / 1_000_000)

export const recordAgentUsage = async (
  db: Db,
  input: AgentUsageRecordInput & { grant: string; now?: Date }
): Promise<AgentUsageRecordResult> => {
  const tokenHash = await hashAgentToken(input.grant)
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const context = await validateGrantInTransaction(tx, {
        tokenHash,
        kind: "run",
        now,
      })
      if (!context.runId) throw publicErrors.unauthorized()

      const priceRows = await tx
        .select()
        .from(agentModelPrices)
        .where(
          and(
            eq(agentModelPrices.provider, input.provider),
            eq(agentModelPrices.model, input.model),
            lte(agentModelPrices.effectiveFrom, now),
            or(
              isNull(agentModelPrices.effectiveTo),
              gt(agentModelPrices.effectiveTo, now)
            )
          )
        )
        .orderBy(
          desc(agentModelPrices.effectiveFrom),
          desc(agentModelPrices.id)
        )
        .limit(1)
      const price = priceRows[0]
      const calculatedCostMicros = price
        ? pricedMicros(
            input.inputNoCacheTokenCount,
            price.inputPriceMicrosPerMillion
          ) +
          pricedMicros(
            input.cacheReadTokenCount,
            price.cacheReadPriceMicrosPerMillion
          ) +
          pricedMicros(
            input.cacheWriteTokenCount,
            price.cacheWritePriceMicrosPerMillion
          ) +
          pricedMicros(
            input.outputTokenCount,
            price.outputPriceMicrosPerMillion
          )
        : 0
      const pricingVersion = price?.pricingVersion ?? "unpriced"
      const eventRows = await tx
        .insert(agentUsageEvents)
        .values({
          id: crypto.randomUUID(),
          organizationId: context.organizationId,
          threadId: context.threadId,
          runId: context.runId,
          userId: context.userId,
          provider: input.provider,
          model: input.model,
          inputTokenCount: input.inputTokenCount,
          inputNoCacheTokenCount: input.inputNoCacheTokenCount,
          cacheReadTokenCount: input.cacheReadTokenCount,
          cacheWriteTokenCount: input.cacheWriteTokenCount,
          outputTokenCount: input.outputTokenCount,
          textOutputTokenCount: input.textOutputTokenCount,
          reasoningTokenCount: input.reasoningTokenCount,
          totalTokenCount: input.totalTokenCount,
          imageInputCount: input.imageInputCount,
          calculatedCostMicros,
          providerCostMicros: input.providerCostMicros ?? null,
          pricingVersion,
          currency: "USD",
          isEstimate: input.providerCostMicros === undefined,
          durationMs: input.durationMs,
          runEventId: input.runEventId,
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: agentUsageEvents.id })
      if (!eventRows[0]) {
        return { recorded: false, calculatedCostMicros, pricingVersion }
      }

      const costMicros = input.providerCostMicros ?? calculatedCostMicros
      const date = now.toISOString().slice(0, 10)
      await tx
        .insert(agentUsageDaily)
        .values({
          id: crypto.randomUUID(),
          date,
          organizationId: context.organizationId,
          userId: context.userId,
          provider: input.provider,
          model: input.model,
          runCount: 1,
          inputTokenCount: input.inputTokenCount,
          outputTokenCount: input.outputTokenCount,
          reasoningTokenCount: input.reasoningTokenCount,
          totalTokenCount: input.totalTokenCount,
          costMicros,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            agentUsageDaily.date,
            agentUsageDaily.organizationId,
            agentUsageDaily.userId,
            agentUsageDaily.provider,
            agentUsageDaily.model,
          ],
          set: {
            runCount: sql`${agentUsageDaily.runCount} + 1`,
            inputTokenCount: sql`${agentUsageDaily.inputTokenCount} + ${input.inputTokenCount}`,
            outputTokenCount: sql`${agentUsageDaily.outputTokenCount} + ${input.outputTokenCount}`,
            reasoningTokenCount: sql`${agentUsageDaily.reasoningTokenCount} + ${input.reasoningTokenCount}`,
            totalTokenCount: sql`${agentUsageDaily.totalTokenCount} + ${input.totalTokenCount}`,
            costMicros: sql`${agentUsageDaily.costMicros} + ${costMicros}`,
            updatedAt: now,
          },
        })
      await tx
        .update(agentRuns)
        .set({
          inputTokenCount: input.inputTokenCount,
          outputTokenCount: input.outputTokenCount,
        })
        .where(
          and(
            eq(agentRuns.organizationId, context.organizationId),
            eq(agentRuns.id, context.runId)
          )
        )
      return { recorded: true, calculatedCostMicros, pricingVersion }
    })
  } catch (cause) {
    if (cause instanceof AppError) throw cause
    throw publicErrors.internal(cause, {
      module: "agent-usage",
      operation: "recordAgentUsage",
    })
  }
}

type UsageTotal = {
  runCount: number
  inputTokenCount: number
  outputTokenCount: number
  reasoningTokenCount: number
  totalTokenCount: number
  costMicros: number
}

const emptyUsageTotal = (): UsageTotal => ({
  runCount: 0,
  inputTokenCount: 0,
  outputTokenCount: 0,
  reasoningTokenCount: 0,
  totalTokenCount: 0,
  costMicros: 0,
})

const addUsage = (total: UsageTotal, row: UsageTotal): UsageTotal => ({
  runCount: total.runCount + row.runCount,
  inputTokenCount: total.inputTokenCount + row.inputTokenCount,
  outputTokenCount: total.outputTokenCount + row.outputTokenCount,
  reasoningTokenCount: total.reasoningTokenCount + row.reasoningTokenCount,
  totalTokenCount: total.totalTokenCount + row.totalTokenCount,
  costMicros: total.costMicros + row.costMicros,
})

const usagePeriod = (month: string | undefined, now: Date) => {
  const selected = month ?? now.toISOString().slice(0, 7)
  const start = `${selected}-01`
  const year = Number(selected.slice(0, 4))
  const monthNumber = Number(selected.slice(5, 7))
  const end = new Date(Date.UTC(year, monthNumber, 1))
    .toISOString()
    .slice(0, 10)
  return { month: selected, start, end }
}

export const getAgentMonthlyUsageForSession = async (
  db: Db,
  input: { sessionId: string; userId: string; month?: string; now?: Date }
) =>
  db.transaction(async (tx) => {
    const now = input.now ?? new Date()
    const current = await requireLiveSession(tx, { ...input, now })
    await requireActiveMembership(tx, current)
    const period = usagePeriod(input.month, now)
    const rows = await tx
      .select()
      .from(agentUsageDaily)
      .where(
        and(
          eq(agentUsageDaily.organizationId, current.activeOrganizationId),
          eq(agentUsageDaily.userId, input.userId),
          lt(agentUsageDaily.date, period.end),
          sql`${agentUsageDaily.date} >= ${period.start}`
        )
      )
    const byModel = new Map<
      string,
      UsageTotal & { provider: string; model: string }
    >()
    for (const row of rows) {
      const key = `${row.provider}\u0000${row.model}`
      const currentTotal = byModel.get(key) ?? {
        ...emptyUsageTotal(),
        provider: row.provider,
        model: row.model,
      }
      byModel.set(key, {
        ...currentTotal,
        ...addUsage(currentTotal, row),
      })
    }
    return {
      month: period.month,
      totals: rows.reduce(addUsage, emptyUsageTotal()),
      byModel: [...byModel.values()].toSorted(
        (a, b) => b.costMicros - a.costMicros || a.model.localeCompare(b.model)
      ),
    }
  })

export const getAgentOrganizationUsageForSession = async (
  db: Db,
  input: { sessionId: string; userId: string; month?: string; now?: Date }
) =>
  db.transaction(async (tx) => {
    const now = input.now ?? new Date()
    const current = await requireLiveSession(tx, { ...input, now })
    const role = await requireActiveMembership(tx, current)
    if (role === "member") {
      throw publicErrors.forbidden("Only organization admins can view usage")
    }
    const period = usagePeriod(input.month, now)
    const rows = await tx
      .select()
      .from(agentUsageDaily)
      .where(
        and(
          eq(agentUsageDaily.organizationId, current.activeOrganizationId),
          sql`${agentUsageDaily.date} >= ${period.start}`,
          lt(agentUsageDaily.date, period.end)
        )
      )
    const grouped = new Map<
      string,
      UsageTotal & { userId: string; provider: string; model: string }
    >()
    for (const row of rows) {
      const key = `${row.userId}\u0000${row.provider}\u0000${row.model}`
      const currentTotal = grouped.get(key) ?? {
        ...emptyUsageTotal(),
        userId: row.userId,
        provider: row.provider,
        model: row.model,
      }
      grouped.set(key, {
        ...currentTotal,
        ...addUsage(currentTotal, row),
      })
    }
    return {
      month: period.month,
      rows: [...grouped.values()].toSorted(
        (a, b) =>
          b.costMicros - a.costMicros || a.userId.localeCompare(b.userId)
      ),
    }
  })
