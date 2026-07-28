import type { AgentRuntimeChatInput } from "@enterprise-agentic-saas/agent-contracts"
import type { MastraMemory } from "@mastra/core/memory"

import type { AgentFailureCode } from "../adapters/telemetry/capture"
import type { createThreadTitleAgent } from "../agents/thread-title-agent"
import type { AbortCause } from "./chat-lifecycle"
import type { AgentControlPlanePort } from "./ports"
import type { AgentExecutionContext } from "./run-agent"
import type { RunSettlement } from "./settlement"
import {
  CanonicalResponseCommitDeferredError,
  completeSuccessfulRun,
  type CanonicalResponsePersistence,
} from "./successful-run-finalization"
import { createThreadTitleTask } from "./thread-title"

type FinalizationOutcome = "abort" | "error" | "finish"

type ProductAgentMemory = {
  getMemory(): MastraMemory | Promise<MastraMemory | undefined> | undefined
}

export const createRunFinalizer = ({
  abort,
  api,
  attempt,
  captureFailure,
  context,
  input,
  memoryResourceId,
  productAgent,
  release,
  runGrant,
  settlement,
  shouldGenerateTitle,
  persistStoppedUserMessage,
  threadTitleAgent,
}: {
  abort: {
    close(): void
    getCause(): AbortCause | undefined
  }
  api: AgentControlPlanePort
  attempt: number
  captureFailure: (code: AgentFailureCode) => void
  context: AgentExecutionContext
  input: AgentRuntimeChatInput
  memoryResourceId: string
  productAgent: ProductAgentMemory
  release(): void
  runGrant: string
  settlement: RunSettlement
  shouldGenerateTitle: boolean
  persistStoppedUserMessage(): Promise<void>
  threadTitleAgent: ReturnType<typeof createThreadTitleAgent>
}) => {
  let outcome: FinalizationOutcome | undefined
  let started = false
  let finalizationTask: Promise<void> | undefined
  let titleTask: Promise<void> | undefined
  let titleTaskScheduled = false
  let recordObservedUsage: (() => Promise<void>) | undefined
  let canonicalResponsePersistence: CanonicalResponsePersistence | undefined

  const scheduleTitle = (authorizedFinish = false) => {
    if (
      !shouldGenerateTitle ||
      titleTaskScheduled ||
      (!authorizedFinish && outcome) ||
      abort.getCause()
    ) {
      return
    }
    titleTaskScheduled = true
    titleTask = (async () => {
      const memory = await productAgent.getMemory()
      if (!memory) return
      await createThreadTitleTask({
        api,
        attempt,
        captureFailure,
        memory,
        message: input.message,
        resourceId: memoryResourceId,
        runGrant,
        threadId: input.threadId,
        titleAgent: threadTitleAgent,
      })
    })().catch(() => captureFailure("title_failed"))
    context.waitUntil(titleTask)
  }

  const finalize = async (finalOutcome: FinalizationOutcome) => {
    try {
      if (finalOutcome === "abort") {
        await persistStoppedUserMessage()
        await settlement.cancel()
        await recordObservedUsage?.()
        await titleTask
      } else if (finalOutcome === "finish") {
        if (recordObservedUsage && canonicalResponsePersistence) {
          await completeSuccessfulRun({
            desiredOutcome: settlement.isHeldForApproval()
              ? "waiting_approval"
              : "completed",
            persistence: canonicalResponsePersistence,
            recordUsage: recordObservedUsage,
            onCommitDeferred: () => captureFailure("memory_commit_deferred"),
            scheduleTitle: () => scheduleTitle(true),
          })
        }
      } else {
        await recordObservedUsage?.()
        await titleTask
        await settlement.fail()
      }
    } catch (cause) {
      if (cause instanceof CanonicalResponseCommitDeferredError) {
        throw new Error("Agent response persistence is deferred", { cause })
      }
      captureFailure("model_failed")
      await settlement.fail()
      if (finalOutcome === "finish") {
        throw new Error("Agent response persistence failed", { cause })
      }
    } finally {
      release()
    }
  }

  const start = () => {
    if (
      !recordObservedUsage ||
      !outcome ||
      (outcome === "finish" && !canonicalResponsePersistence) ||
      started
    ) {
      return
    }
    started = true
    finalizationTask = finalize(outcome)
    context.waitUntil(finalizationTask.catch(() => undefined))
  }

  const schedule = (nextOutcome: FinalizationOutcome) => {
    if (outcome) return
    abort.close()
    outcome = nextOutcome
    if (nextOutcome === "error") captureFailure("model_failed")
    start()
  }

  const outcomeFor = (fallback: FinalizationOutcome): FinalizationOutcome => {
    if (abort.getCause() === "user") return "abort"
    if (
      abort.getCause() === "revoked" ||
      abort.getCause() === "total_timeout" ||
      abort.getCause() === "useful_timeout"
    ) {
      return "error"
    }
    return fallback
  }

  return {
    isReady: () => Boolean(recordObservedUsage && canonicalResponsePersistence),
    isStarted: () => started,
    outcomeFor,
    schedule,
    setOutputHandlers: (
      recordUsage: () => Promise<void>,
      persistence: CanonicalResponsePersistence
    ) => {
      recordObservedUsage = recordUsage
      canonicalResponsePersistence = persistence
      start()
    },
    waitForStream: async () => {
      if (!outcome) schedule(outcomeFor("finish"))
      start()
      if (!finalizationTask) {
        throw new Error("Agent response finalization is unavailable")
      }
      await finalizationTask
    },
  }
}
