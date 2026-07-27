import type { AgentUiMessage } from "@enterprise-agentic-saas/agent-contracts"
import type { MastraMemory } from "@mastra/core/memory"

import type { AgentFailureCode } from "../adapters/telemetry/capture"
import type { createThreadTitleAgent } from "../agents/thread-title-agent"
import { normalizeAgentUsage } from "../core/usage/normalize"
import type { AgentControlPlanePort } from "./ports"

const TITLE_TIMEOUT_MS = 10_000
const DEFAULT_THREAD_TITLE = "New conversation"

const currentUserText = (message: AgentUiMessage): string =>
  message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .slice(0, 8_000)

const isDefaultTitle = (title?: string): boolean =>
  !title || title === DEFAULT_THREAD_TITLE || title.startsWith("New Thread ")

const normalizeGeneratedThreadTitle = (value: string): string | undefined => {
  const title = value
    .replace(/^#+\s*/u, "")
    .replace(/^["'`]|["'`]$/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
  if (
    title.length === 0 ||
    title.length > 80 ||
    /(?:bearer|token|secret|password|https?:\/\/|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/iu.test(
      title
    )
  ) {
    return undefined
  }
  return title
}

export const createThreadTitleTask = ({
  api,
  attempt,
  captureFailure,
  memory,
  message,
  resourceId,
  runGrant,
  threadId,
  titleAgent,
}: {
  api: Pick<AgentControlPlanePort, "recordUsage">
  attempt: number
  captureFailure: (code: AgentFailureCode) => void
  memory: MastraMemory
  message: AgentUiMessage
  resourceId: string
  runGrant: string
  threadId: string
  titleAgent: ReturnType<typeof createThreadTitleAgent>
}): Promise<void> =>
  (async () => {
    const existing = await memory.getThreadById({ threadId })
    if (
      !existing ||
      existing.resourceId !== resourceId ||
      !isDefaultTitle(existing.title)
    ) {
      return
    }
    const text = currentUserText(message)
    if (!text) return

    const startedAt = Date.now()
    const result = await titleAgent.generate(
      `次のユーザー発話をtitleへ要約してください。\n\n<user_text>\n${text}\n</user_text>`,
      {
        abortSignal: AbortSignal.timeout(TITLE_TIMEOUT_MS),
        modelSettings: { maxOutputTokens: 96, temperature: 0 },
        providerOptions: {
          openrouter: {
            reasoning: { enabled: false, effort: "none", exclude: true },
          },
        },
        tracingOptions: { hideInput: true, hideOutput: true },
      }
    )
    let titleFailure: unknown
    try {
      const title = normalizeGeneratedThreadTitle(result.text)
      if (!title) throw new Error("Agent thread title is unavailable")
      const latest = await memory.getThreadById({ threadId })
      if (
        latest &&
        latest.resourceId === resourceId &&
        isDefaultTitle(latest.title)
      ) {
        await memory.updateThread({
          id: threadId,
          metadata: latest.metadata ?? {},
          title,
        })
      }
    } catch (error) {
      titleFailure = error
    }
    try {
      await api.recordUsage({
        grant: runGrant,
        ...normalizeAgentUsage({
          durationMs: Date.now() - startedAt,
          imageInputCount: 0,
          runEventId: `title_${attempt}`,
          stepProviderMetadata: result.steps.map(
            (step) => step.providerMetadata
          ),
          usage: result.totalUsage,
        }),
      })
    } catch {
      captureFailure("usage_record_failed")
    }
    if (titleFailure) throw titleFailure
  })()
