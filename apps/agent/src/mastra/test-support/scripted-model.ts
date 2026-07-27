import { MockLanguageModelV3 } from "ai/test"
import { z } from "zod"

export const SCRIPTED_MODEL_SENTINEL =
  "ENTERPRISE_AGENT_SCRIPTED_MODEL_SENTINEL_v1"

export type ScriptedUsage = {
  inputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
}

export type ScriptedModelPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "tool-call"
      input: unknown
      toolCallId: string
      toolName: string
    }
  | { type: "malformed"; value: unknown }

export type ScriptedStreamChunk = {
  delayMs?: number
  value: unknown
}

export type ScriptedModelStep = {
  delayMs?: number
  error?: Error
  finishReason?: "stop" | "length" | "tool-calls" | "error" | "other"
  parts: readonly ScriptedModelPart[]
  stream?: readonly ScriptedStreamChunk[]
  usage?: ScriptedUsage
}

export type ScriptedModelOptions = {
  metadataSentinel?: string
  modelId?: string
  provider?: string
  repeat?: boolean
}

type GenerateResult = Awaited<
  ReturnType<InstanceType<typeof MockLanguageModelV3>["doGenerate"]>
>
type StreamResult = Awaited<
  ReturnType<InstanceType<typeof MockLanguageModelV3>["doStream"]>
>
type StreamChunk =
  StreamResult["stream"] extends ReadableStream<infer Chunk> ? Chunk : never

const generateContentSchema = z.custom<GenerateResult["content"]>()
const streamChunkSchema = z.custom<StreamChunk>()

const usageFor = (usage: ScriptedUsage | undefined) => ({
  inputTokens: {
    cacheRead: 0,
    cacheWrite: 0,
    noCache: usage?.inputTokens ?? 1,
    total: usage?.inputTokens ?? 1,
  },
  outputTokens: {
    reasoning: usage?.reasoningTokens ?? 0,
    text: usage?.outputTokens ?? 1,
    total: (usage?.outputTokens ?? 1) + (usage?.reasoningTokens ?? 0),
  },
})

const waitForDelay = async (
  delayMs: number | undefined,
  abortSignal: AbortSignal | undefined
) => {
  if (!delayMs) {
    if (abortSignal?.aborted) throw abortSignal.reason
    return
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, delayMs)
    const abort = () => {
      clearTimeout(timeout)
      reject(abortSignal?.reason ?? new DOMException("Aborted", "AbortError"))
    }
    abortSignal?.addEventListener("abort", abort, { once: true })
    if (abortSignal?.aborted) abort()
  })
}

const generateContent = (parts: readonly ScriptedModelPart[]) =>
  parts.map((part) => {
    if (part.type === "tool-call") {
      return {
        type: "tool-call",
        input: JSON.stringify(part.input),
        toolCallId: part.toolCallId,
        toolName: part.toolName,
      }
    }
    if (part.type === "malformed") return part.value
    return part
  })

const defaultStreamChunks = (
  step: ScriptedModelStep,
  metadataSentinel?: string
): unknown[] => {
  const chunks: unknown[] = [{ type: "stream-start", warnings: [] }]
  for (const [index, part] of step.parts.entries()) {
    const id = `scripted-${index}`
    if (part.type === "text" || part.type === "reasoning") {
      chunks.push(
        { type: `${part.type}-start`, id },
        {
          type: `${part.type}-delta`,
          id,
          delta: part.text,
          ...(metadataSentinel
            ? { providerMetadata: { sentinel: metadataSentinel } }
            : {}),
        },
        { type: `${part.type}-end`, id }
      )
      continue
    }
    if (part.type === "tool-call") {
      chunks.push({
        type: "tool-call",
        input: JSON.stringify(part.input),
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        ...(metadataSentinel
          ? {
              callProviderMetadata: {
                sentinel: `${metadataSentinel}:call`,
              },
              toolMetadata: { sentinel: `${metadataSentinel}:tool` },
            }
          : {}),
      })
      continue
    }
    chunks.push(part.value)
  }
  chunks.push({
    type: "finish",
    finishReason: {
      unified: step.finishReason ?? "stop",
      raw: step.finishReason ?? "stop",
    },
    usage: usageFor(step.usage),
    ...(metadataSentinel
      ? {
          resultProviderMetadata: {
            sentinel: `${metadataSentinel}:result`,
          },
        }
      : {}),
  })
  return chunks
}

const streamFrom = (
  chunks: readonly ScriptedStreamChunk[],
  abortSignal: AbortSignal | undefined
): StreamResult["stream"] =>
  new ReadableStream<StreamChunk>({
    async start(controller) {
      try {
        await chunks.reduce(async (previous, chunk) => {
          await previous
          await waitForDelay(chunk.delayMs, abortSignal)
          controller.enqueue(streamChunkSchema.parse(chunk.value))
        }, Promise.resolve())
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })

export const createScriptedModel = (
  steps: readonly ScriptedModelStep[],
  options: ScriptedModelOptions = {}
) => {
  const firstStep = steps.at(0)
  if (!firstStep) throw new Error("Scripted model needs one step")
  let cursor = 0
  const nextStep = () => {
    const step = steps[cursor]
    if (!step) {
      if (!options.repeat) throw new Error("Scripted model is exhausted")
      cursor = 1
      return firstStep
    }
    cursor += 1
    return step
  }

  return new MockLanguageModelV3({
    modelId:
      options.modelId ?? `${SCRIPTED_MODEL_SENTINEL}:scripted-agent-model`,
    provider: options.provider ?? "scripted",
    doGenerate: async ({ abortSignal }) => {
      const step = nextStep()
      await waitForDelay(step.delayMs, abortSignal)
      if (step.error) throw step.error
      const result: GenerateResult = {
        content: generateContentSchema.parse(generateContent(step.parts)),
        finishReason: {
          unified: step.finishReason ?? "stop",
          raw: step.finishReason ?? "stop",
        },
        usage: usageFor(step.usage),
        warnings: [],
      }
      return result
    },
    doStream: async ({ abortSignal }) => {
      const step = nextStep()
      await waitForDelay(step.delayMs, abortSignal)
      if (step.error) throw step.error
      const chunks =
        step.stream ??
        defaultStreamChunks(step, options.metadataSentinel).map((value) => ({
          value,
        }))
      const result: StreamResult = {
        stream: streamFrom(chunks, abortSignal),
      }
      return result
    },
  })
}
