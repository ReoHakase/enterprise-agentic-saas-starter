import type { AgentFailureCode } from "../adapters/telemetry/capture"
import { reportDevelopmentCauseChain } from "../adapters/telemetry/development-error"

const THREAD_TITLE_PERSISTENCE_TIMEOUT_MS = 30_000

export type ThreadTitleLifecycle = {
  onTitleGenerated: () => void
  settle: () => void
}

export const createThreadTitleLifecycle = async ({
  captureFailure,
  context,
  environment,
  readMemory,
  shouldGenerateTitle,
  threadId,
}: {
  captureFailure: (code: AgentFailureCode) => void
  context: { waitUntil(promise: Promise<unknown>): void }
  environment: Parameters<typeof reportDevelopmentCauseChain>[0]
  readMemory: () => Promise<
    | {
        getThreadById(input: {
          threadId: string
        }): Promise<{ title?: string } | null | undefined>
      }
    | undefined
  >
  shouldGenerateTitle: boolean
  threadId: string
}): Promise<ThreadTitleLifecycle | undefined> => {
  if (!shouldGenerateTitle) return undefined
  try {
    const memory = await readMemory()
    if (!memory) return undefined
    const thread = await memory.getThreadById({ threadId })
    if (thread?.title) return undefined
  } catch (cause) {
    reportDevelopmentCauseChain(environment, "thread-title-state", cause)
    captureFailure("memory_failed")
    return undefined
  }

  const { promise: generated, resolve: settle } = Promise.withResolvers<void>()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const bounded = Promise.race([
    generated,
    new Promise<void>((resolve) => {
      timeout = setTimeout(resolve, THREAD_TITLE_PERSISTENCE_TIMEOUT_MS)
    }),
  ]).finally(() => {
    if (timeout !== undefined) clearTimeout(timeout)
  })
  context.waitUntil(bounded)
  return { onTitleGenerated: settle, settle }
}
