import {
  reconcileMemoryCommit,
  suspendMemoryCommit,
} from "../workflows/memory-commit"
import type { MemoryCommitOutcome } from "../workflows/memory-commit/workflow-contract"
import type { AgentControlPlanePort } from "./ports"

type CanonicalResponsePersistenceInput = {
  api: Pick<AgentControlPlanePort, "settleMemoryCommit">
  applicationRunId: string
  drainMessages(): Parameters<typeof suspendMemoryCommit>[1]["messages"]
  mastra: Parameters<typeof suspendMemoryCommit>[0]
  memoryResourceId: string
  threadId: string
}

export const createCanonicalResponsePersistence = (
  input: CanonicalResponsePersistenceInput
) => {
  let messagesDrained = false
  let desiredOutcome: MemoryCommitOutcome | undefined

  return {
    stage: async (outcome: MemoryCommitOutcome) => {
      if (messagesDrained) throw new Error("Memory batch already drained")
      messagesDrained = true
      desiredOutcome = outcome
      await suspendMemoryCommit(input.mastra, {
        applicationRunId: input.applicationRunId,
        desiredOutcome,
        messages: input.drainMessages(),
        resourceId: input.memoryResourceId,
        threadId: input.threadId,
      })
    },
    commit: async () => {
      if (!desiredOutcome) throw new Error("Memory batch is not staged")
      const status = await reconcileMemoryCommit(input.mastra, input.api, {
        applicationRunId: input.applicationRunId,
        desiredOutcome,
      })
      if (status !== "committed") {
        throw new Error("Agent response commit is unavailable")
      }
    },
  }
}
