import type { AgentUsageRecordInput } from "@enterprise-agentic-saas/api/agent-client"

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

const providerCostMicros = (raw: unknown): number | undefined => {
  if (!raw || typeof raw !== "object" || !("cost" in raw)) return undefined
  const cost = Reflect.get(raw, "cost")
  return typeof cost === "number" && Number.isFinite(cost) && cost >= 0
    ? Math.round(cost * 1_000_000)
    : undefined
}

export const normalizeAgentUsage = (input: {
  usage: UsageLike
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
  const costMicros = providerCostMicros(input.usage.raw)
  return {
    provider: "openrouter",
    model: "qwen/qwen3.6-flash",
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
