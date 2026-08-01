import { isToolUIPart } from "ai"

import type { AgentChatMessage } from "../../schema"

export type AgentWaitingState = "continuation" | "first-byte"

const activeToolStates = new Set(["input-streaming", "input-available"])

export const getAgentWaitingState = (
  status: "error" | "ready" | "streaming" | "submitted",
  messages: AgentChatMessage[]
): AgentWaitingState | undefined => {
  if (status === "submitted") return "first-byte"
  if (status !== "streaming") return undefined

  const assistant = messages.findLast((message) => message.role === "assistant")
  const lastPart = assistant?.parts.at(-1)
  if (!lastPart) return "first-byte"
  if (
    (lastPart.type === "reasoning" || lastPart.type === "text") &&
    lastPart.state === "streaming"
  )
    return undefined
  if (isToolUIPart(lastPart) && activeToolStates.has(lastPart.state))
    return undefined

  const hasCompletedTool =
    assistant?.parts.some(
      (part) => isToolUIPart(part) && part.state === "output-available"
    ) ?? false
  return hasCompletedTool ? "continuation" : "first-byte"
}
