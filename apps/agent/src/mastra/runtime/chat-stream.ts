import type { createRunAbortLifecycle } from "./chat-lifecycle"
import type { startProductOutput } from "./chat-output"
import { projectServerTimeoutError, redactNativeStream } from "./native-stream"

export const createFinalizedProductStream = ({
  abortLifecycle,
  output,
}: {
  abortLifecycle: ReturnType<typeof createRunAbortLifecycle>
  output: Awaited<ReturnType<typeof startProductOutput>>
}) =>
  projectServerTimeoutError(
    redactNativeStream(output),
    () => abortLifecycle.getCause() === "total_timeout"
  )
