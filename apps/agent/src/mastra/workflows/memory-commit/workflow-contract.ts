import type { MastraDBMessage } from "@mastra/core/agent"

export const MEMORY_COMMIT_WORKFLOW_ID = "memory-commit"
export const MEMORY_COMMIT_STEP_ID = "persist-memory-batch"
export type MemoryCommitOutcome = "completed" | "waiting_approval"

const MAX_MEMORY_BATCH_MESSAGES = 1_000

export const stableMemoryCommitMessages = (
  messages: readonly MastraDBMessage[],
  threadId?: string,
  resourceId?: string
): MastraDBMessage[] => {
  if (messages.length > MAX_MEMORY_BATCH_MESSAGES) {
    throw new Error("Memory commit batch is invalid")
  }
  const ids = new Set<string>()
  for (const message of messages) {
    if (
      !/^[A-Za-z0-9_-]{1,128}$/u.test(message.id) ||
      ids.has(message.id) ||
      (threadId !== undefined && message.threadId !== threadId) ||
      (resourceId !== undefined && message.resourceId !== resourceId)
    ) {
      throw new Error("Memory commit batch is invalid")
    }
    ids.add(message.id)
  }
  return messages.map((message) => Object.assign({}, message))
}

export const memoryCommitWorkflowRunId = (applicationRunId: string) =>
  `memory_commit_${applicationRunId}`
