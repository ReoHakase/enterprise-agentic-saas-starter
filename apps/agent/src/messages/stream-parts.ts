import type { AgentContextBudget } from "@enterprise-agentic-saas/api/agent-client"
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

const toolLabel = (toolName: string, status: "running" | "completed") =>
  `${status === "running" ? "Running" : "Completed"} ${toolName.replaceAll("_", " ")}`

/**
 * MastraのUI streamへ、製品固有だがcanonicalなactivity/title partを追加する。
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
      transform(chunk, controller) {
        controller.enqueue(chunk)
        if (chunk.type === "tool-input-available") {
          toolNames.set(chunk.toolCallId, chunk.toolName)
          controller.enqueue({
            type: "data-activity",
            data: {
              kind: "tool",
              label: toolLabel(chunk.toolName, "running"),
              status: "running",
            },
          })
          return
        }
        if (chunk.type !== "tool-output-available") return
        const toolName = toolNames.get(chunk.toolCallId)
        if (!toolName) return
        toolNames.delete(chunk.toolCallId)
        controller.enqueue({
          type: "data-activity",
          data: {
            kind: "tool",
            label: toolLabel(toolName, "completed"),
            status: "completed",
          },
        })
        if (toolName !== "rename_thread") return
        const data = titleProjection(chunk.output)
        if (data) controller.enqueue({ type: "data-thread-title", data })
      },
      async flush(controller) {
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
