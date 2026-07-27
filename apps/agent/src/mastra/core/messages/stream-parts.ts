import type { AgentContextBudget } from "@enterprise-agentic-saas/agent-contracts"
import type { UIMessageChunk } from "ai"

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const titleProjection = (output: unknown) => {
  if (!isRecord(output)) return null
  const { renamed, threadId, title } = output
  return typeof renamed === "boolean" &&
    typeof threadId === "string" &&
    IDENTIFIER_PATTERN.test(threadId) &&
    typeof title === "string" &&
    title.length > 0 &&
    title.length <= 80
    ? { renamed, threadId, title }
    : null
}

/**
 * MastraのUI streamへ、transient statusとcanonicalなtitle/context partを追加する。
 * provider chunkのpayloadを複製せず、allowlist済みの投影だけをemitする。
 */
export const addAgentStreamDataParts = (
  stream: ReadableStream<UIMessageChunk>,
  finalContext?: {
    budget: AgentContextBudget
    observedInputTokens: () => Promise<number | null>
  }
): ReadableStream<UIMessageChunk> => {
  const toolNames = new Map<string, string>()
  return stream.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
      start(controller) {
        controller.enqueue({
          type: "data-activity",
          id: "response-status",
          transient: true,
          data: {
            kind: "status",
            label: "応答を生成中",
            status: "running",
          },
        })
      },
      transform(chunk, controller) {
        controller.enqueue(chunk)
        if (chunk.type === "tool-input-available") {
          toolNames.set(chunk.toolCallId, chunk.toolName)
          return
        }
        if (chunk.type !== "tool-output-available") return
        const toolName = toolNames.get(chunk.toolCallId)
        if (!toolName) return
        toolNames.delete(chunk.toolCallId)
        if (toolName !== "rename_thread") return
        const data = titleProjection(chunk.output)
        if (data) controller.enqueue({ type: "data-thread-title", data })
      },
      async flush(controller) {
        controller.enqueue({
          type: "data-activity",
          id: "response-status",
          transient: true,
          data: {
            kind: "status",
            label: "応答を生成中",
            status: "completed",
          },
        })
        if (!finalContext) return
        const observedInputTokens = await finalContext.observedInputTokens()
        if (observedInputTokens === null) return
        controller.enqueue({
          type: "data-context-budget",
          data: { ...finalContext.budget, observedInputTokens },
        })
      },
    })
  )
}
