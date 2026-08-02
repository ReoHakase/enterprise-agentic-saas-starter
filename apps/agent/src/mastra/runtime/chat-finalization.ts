import type { AgentFailureCode } from "../adapters/telemetry/capture"
import type { AbortCause } from "./chat-lifecycle"
import type { AgentExecutionContext } from "./run-agent"
import type { RunSettlement } from "./settlement"

type FinalizationOutcome = "abort" | "error" | "finish"

export const createRunFinalizer = ({
  abort,
  captureFailure,
  context,
  release,
  reportFailure,
  settlement,
}: {
  abort: {
    close(): void
    getCause(): AbortCause | undefined
  }
  captureFailure: (code: AgentFailureCode) => void
  context: AgentExecutionContext
  release(): void
  reportFailure(cause: unknown): void
  settlement: RunSettlement
}) => {
  let finalizationTask: Promise<void> | undefined
  let outcome: FinalizationOutcome | undefined
  let recordUsage: (() => Promise<void>) | undefined

  const outcomeFor = (fallback: FinalizationOutcome): FinalizationOutcome => {
    if (abort.getCause() === "user") return "abort"
    if (abort.getCause()) return "error"
    return fallback
  }

  const finalize = () => {
    if (finalizationTask) return finalizationTask
    const finalOutcome = outcome ?? outcomeFor("finish")
    abort.close()
    finalizationTask = (async () => {
      try {
        await recordUsage?.()
        if (finalOutcome === "abort") {
          await settlement.cancel()
        } else if (finalOutcome === "error") {
          await settlement.fail()
        } else if (!settlement.isHeldForApproval()) {
          await settlement.complete()
        }
      } catch (cause) {
        reportFailure(cause)
        captureFailure("run_finalization_failed")
        await settlement.fail()
      } finally {
        release()
      }
    })()
    context.waitUntil(finalizationTask)
    return finalizationTask
  }

  const schedule = (
    nextOutcome: FinalizationOutcome,
    failureCode: AgentFailureCode = "model_failed"
  ) => {
    if (outcome) return
    outcome = nextOutcome
    if (nextOutcome === "error") captureFailure(failureCode)
  }

  return {
    isStarted: () => Boolean(finalizationTask),
    outcomeFor,
    schedule,
    finish: async (nextRecordUsage: () => Promise<void>) => {
      recordUsage = nextRecordUsage
      schedule(outcomeFor("finish"))
      await finalize()
    },
    waitForStream: finalize,
  }
}
