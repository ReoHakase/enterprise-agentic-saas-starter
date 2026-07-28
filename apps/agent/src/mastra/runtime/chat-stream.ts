import { toAISdkStream } from "@mastra/ai-sdk"

import type { createRunFinalizer } from "./chat-finalization"
import type { createRunAbortLifecycle } from "./chat-lifecycle"
import type { startProductOutput } from "./chat-output"
import {
  enforceRunLiveness,
  observeUsefulNativeOutput,
  projectServerTimeoutError,
  redactNativeStream,
} from "./native-stream"
import type { AgentControlPlanePort } from "./ports"

export const createFinalizedProductStream = ({
  abortLifecycle,
  api,
  finalizer,
  output,
  runGrant,
}: {
  abortLifecycle: ReturnType<typeof createRunAbortLifecycle>
  api: AgentControlPlanePort
  finalizer: ReturnType<typeof createRunFinalizer>
  output: Awaited<ReturnType<typeof startProductOutput>>
  runGrant: string
}) => {
  const aiStream = toAISdkStream(output, {
    from: "agent",
    onError: () => "Model response failed.",
    sendReasoning: false,
    sendSources: true,
    version: "v6",
  })
  const liveStream = enforceRunLiveness(
    aiStream,
    () => api.readActiveOrganization({ grant: runGrant }),
    (cause) => {
      abortLifecycle.abortFrom("revoked", cause)
      finalizer.schedule("error")
    }
  )
  const usefulStream = observeUsefulNativeOutput(
    redactNativeStream(liveStream),
    abortLifecycle.resetUsefulOutputTimer
  )
  return projectServerTimeoutError(
    usefulStream,
    () =>
      abortLifecycle.getCause() === "total_timeout" ||
      abortLifecycle.getCause() === "useful_timeout"
  )
}
