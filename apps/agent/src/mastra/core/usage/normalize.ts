import type { AgentUsageRecordInput } from "@enterprise-agentic-saas/agent-contracts"

import { AGENT_MODEL_PROFILE } from "../model-profile"

type UsageLike = {
  inputTokens?: number
  inputTokenDetails?: {
    noCacheTokens?: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
  }
  outputTokens?: number
  outputTokenDetails?: {
    textTokens?: number
    reasoningTokens?: number
  }
  totalTokens?: number
  reasoningTokens?: number
  cachedInputTokens?: number
  raw?: unknown
}

const count = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0

const nonNegativeFiniteNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined

const objectProperty = (value: unknown, property: string): unknown =>
  value && typeof value === "object" ? Reflect.get(value, property) : undefined

const providerCost = (raw: unknown): number | undefined =>
  nonNegativeFiniteNumber(objectProperty(raw, "cost"))

const openRouterStepCost = (providerMetadata: unknown): number | undefined =>
  providerCost(
    objectProperty(objectProperty(providerMetadata, "openrouter"), "usage")
  )

const providerCostMicros = ({
  raw,
  stepProviderMetadata,
}: {
  raw: unknown
  stepProviderMetadata: readonly unknown[]
}): number | undefined => {
  const aggregateCost = providerCost(raw)
  if (aggregateCost !== undefined) return Math.round(aggregateCost * 1_000_000)
  if (stepProviderMetadata.length === 0) return undefined

  let cost = 0
  for (const providerMetadata of stepProviderMetadata) {
    const stepCost = openRouterStepCost(providerMetadata)
    if (stepCost === undefined) return undefined
    cost += stepCost
  }
  return Number.isFinite(cost) ? Math.round(cost * 1_000_000) : undefined
}

export const normalizeAgentUsage = (input: {
  usage: UsageLike
  stepProviderMetadata?: readonly unknown[]
  imageInputCount: number
  durationMs: number
  runEventId: string
}): AgentUsageRecordInput => {
  const inputTokenCount = count(input.usage.inputTokens)
  const cacheReadTokenCount = Math.min(
    inputTokenCount,
    count(
      input.usage.inputTokenDetails?.cacheReadTokens ??
        input.usage.cachedInputTokens
    )
  )
  const cacheWriteTokenCount = Math.min(
    inputTokenCount - cacheReadTokenCount,
    count(input.usage.inputTokenDetails?.cacheWriteTokens)
  )
  const detailedNoCache = input.usage.inputTokenDetails?.noCacheTokens
  const inputNoCacheTokenCount = Math.min(
    inputTokenCount - cacheReadTokenCount - cacheWriteTokenCount,
    detailedNoCache === undefined
      ? inputTokenCount - cacheReadTokenCount - cacheWriteTokenCount
      : count(detailedNoCache)
  )
  const outputTokenCount = count(input.usage.outputTokens)
  // reasoningはoutput totalの内数として扱い、deprecated fieldとの加算はしない。
  const reasoningTokenCount = Math.min(
    outputTokenCount,
    count(
      input.usage.outputTokenDetails?.reasoningTokens ??
        input.usage.reasoningTokens
    )
  )
  const textOutputTokenCount = Math.min(
    outputTokenCount - reasoningTokenCount,
    input.usage.outputTokenDetails?.textTokens === undefined
      ? outputTokenCount - reasoningTokenCount
      : count(input.usage.outputTokenDetails.textTokens)
  )
  const costMicros = providerCostMicros({
    raw: input.usage.raw,
    stepProviderMetadata: input.stepProviderMetadata ?? [],
  })
  return {
    provider: AGENT_MODEL_PROFILE.provider,
    model: AGENT_MODEL_PROFILE.model,
    inputTokenCount,
    inputNoCacheTokenCount,
    cacheReadTokenCount,
    cacheWriteTokenCount,
    outputTokenCount,
    textOutputTokenCount,
    reasoningTokenCount,
    totalTokenCount: inputTokenCount + outputTokenCount,
    imageInputCount: Math.min(
      4,
      Math.max(0, Math.floor(input.imageInputCount))
    ),
    ...(costMicros === undefined ? {} : { providerCostMicros: costMicros }),
    durationMs: Math.min(300_000, Math.max(0, Math.floor(input.durationMs))),
    runEventId: input.runEventId,
  }
}
