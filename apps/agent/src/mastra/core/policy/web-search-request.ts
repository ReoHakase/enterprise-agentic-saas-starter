import type { AgentUiMessage } from "@enterprise-agentic-saas/agent-contracts"

const publicQueryLinePatterns = [
  /^public-only web query\s*:\s*.{2,200}$/iu,
  /^公開情報だけのweb検索\s*[:：]\s*.{2,200}$/iu,
] as const
const explicitSearchPattern = /\bweb search\b|Web検索/iu

const textLines = (message: AgentUiMessage) =>
  message.parts.flatMap((part) =>
    part.type === "text" ? part.text.split(/\r?\n/u) : []
  )

export const requiresWebSearchFirstStep = (
  messages: readonly AgentUiMessage[],
  toolAllowlist?: readonly string[]
): boolean => {
  if (toolAllowlist && !toolAllowlist.includes("web_search")) return false
  const latestUserMessage = messages.findLast(
    (message) => message.role === "user"
  )
  if (!latestUserMessage) return false
  const lines = textLines(latestUserMessage)
  const queryLines = lines.filter((line) =>
    publicQueryLinePatterns.some((pattern) => pattern.test(line.trim()))
  )
  if (queryLines.length !== 1) return false
  const requestText = lines.filter((line) => line !== queryLines[0]).join("\n")
  return explicitSearchPattern.test(requestText)
}
