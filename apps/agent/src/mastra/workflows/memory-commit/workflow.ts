import type { MastraDBMessage } from "@mastra/core/agent"
import type { Mastra } from "@mastra/core/mastra"
import {
  createStep,
  createWorkflow,
  createWorkflowStateReader,
} from "@mastra/core/workflows"
import type { Memory } from "@mastra/memory"
import { jsonSchema } from "ai"

import type { AgentControlPlanePort } from "../../runtime/ports"
import { projectMemorySnapshotMessages } from "./message-projection"
import {
  memoryCommitWorkflowRunId,
  stableMemoryCommitMessages,
  MEMORY_COMMIT_STEP_ID,
  MEMORY_COMMIT_WORKFLOW_ID,
  type MemoryCommitOutcome,
} from "./workflow-contract"

const MAX_MEMORY_BATCH_BYTES = 2 * 1_024 * 1_024
const MAX_MEMORY_COMMIT_RESUME_ATTEMPTS = 8
const MEMORY_COMMIT_RETRY_DELAY_MS = 5
const MEMORY_COMMIT_SCAN_PAGE_SIZE = 100
const MAX_MEMORY_COMMIT_SCAN_RUNS = 10_000
const PENDING_MEMORY_COMMIT_STATUSES = [
  "suspended",
  "running",
  "success",
] as const
const serializeSnapshotMessages = (messages: readonly MastraDBMessage[]) =>
  JSON.stringify(projectMemorySnapshotMessages(messages))
const serializedByteLength = (value: string) =>
  new TextEncoder().encode(value).byteLength

type MemoryCommitInput = {
  applicationRunId: string
  desiredOutcome: MemoryCommitOutcome
  messagesJson: string
  resourceId: string
  threadId: string
}
type MemoryCommitResume = { action: "persist" }
type MemoryCommitOutput = {
  applicationRunId: string
  status: "committed"
}

const identifier = {
  type: "string",
  minLength: 1,
  maxLength: 128,
  pattern: "^[A-Za-z0-9_-]+$",
} as const
const inputSchema = jsonSchema<MemoryCommitInput>({
  type: "object",
  additionalProperties: false,
  required: [
    "applicationRunId",
    "desiredOutcome",
    "messagesJson",
    "resourceId",
    "threadId",
  ],
  properties: {
    applicationRunId: identifier,
    desiredOutcome: {
      type: "string",
      enum: ["completed", "waiting_approval"],
    },
    messagesJson: {
      type: "string",
      minLength: 2,
      maxLength: MAX_MEMORY_BATCH_BYTES,
    },
    resourceId: identifier,
    threadId: identifier,
  },
})
const resumeSchema = jsonSchema<MemoryCommitResume>({
  type: "object",
  additionalProperties: false,
  required: ["action"],
  properties: {
    action: { type: "string", enum: ["persist"] },
  },
})
const outputSchema = jsonSchema<MemoryCommitOutput>({
  type: "object",
  additionalProperties: false,
  required: ["applicationRunId", "status"],
  properties: {
    applicationRunId: identifier,
    status: { type: "string", enum: ["committed"] },
  },
})

const parseMessages = (input: MemoryCommitInput): MastraDBMessage[] => {
  const value: unknown = JSON.parse(input.messagesJson)
  if (!Array.isArray(value)) throw new Error("Memory batch is invalid")
  const messages: MastraDBMessage[] = JSON.parse(input.messagesJson)
  for (const message of messages) {
    message.createdAt = new Date(String(message.createdAt))
  }
  return messages
}

export const createMemoryCommitWorkflow = (
  memory: Pick<Memory, "saveMessages">
) => {
  const persistMemory = createStep({
    id: MEMORY_COMMIT_STEP_ID,
    inputSchema,
    outputSchema,
    resumeSchema,
    suspendSchema: inputSchema,
    execute: async ({ inputData, resumeData, suspend }) => {
      if (!resumeData) {
        return suspend(inputData, { resumeLabel: "memory-ready" })
      }
      try {
        await memory.saveMessages({ messages: parseMessages(inputData) })
        return {
          applicationRunId: inputData.applicationRunId,
          status: "committed" as const,
        }
      } catch {
        return suspend(inputData, { resumeLabel: "memory-retry" })
      }
    },
  })
  return createWorkflow({
    id: MEMORY_COMMIT_WORKFLOW_ID,
    inputSchema,
    outputSchema,
  })
    .then(persistMemory)
    .commit()
}

export type MemoryCommitWorkflow = ReturnType<typeof createMemoryCommitWorkflow>
const activeReconciliations = new Map<string, Promise<"committed">>()

export const suspendMemoryCommit = async (
  mastra: Mastra,
  input: Omit<MemoryCommitInput, "messagesJson"> & {
    messages: readonly MastraDBMessage[]
  }
) => {
  const workflow = mastra.getWorkflow("memoryCommitWorkflow")
  const runId = memoryCommitWorkflowRunId(input.applicationRunId)
  const existing = await workflow.getWorkflowRunById(runId)
  if (existing) {
    if (existing.status !== "suspended") {
      throw new Error("Memory commit is unavailable")
    }
    return
  }
  const messagesJson = serializeSnapshotMessages(
    stableMemoryCommitMessages(input.messages, input.threadId, input.resourceId)
  )
  if (serializedByteLength(messagesJson) > MAX_MEMORY_BATCH_BYTES) {
    throw new Error("Memory commit batch is invalid")
  }
  const run = await workflow.createRun({
    resourceId: input.threadId,
    runId,
  })
  const result = await run.start({
    inputData: {
      applicationRunId: input.applicationRunId,
      desiredOutcome: input.desiredOutcome,
      messagesJson,
      resourceId: input.resourceId,
      threadId: input.threadId,
    },
    tracingOptions: { hideInput: true, hideOutput: true },
  })
  if (result.status !== "suspended") {
    throw new Error("Memory commit is unavailable")
  }
}

const readReconcileInput = (
  snapshot: Parameters<typeof createWorkflowStateReader>[0]
):
  | {
      applicationRunId: string
      desiredOutcome: MemoryCommitOutcome
    }
  | undefined => {
  if (typeof snapshot === "string") return
  const payload = createWorkflowStateReader(snapshot).getStepPayload<{
    applicationRunId?: unknown
    desiredOutcome?: unknown
  }>(MEMORY_COMMIT_STEP_ID)
  if (
    !payload ||
    Array.isArray(payload) ||
    typeof payload.applicationRunId !== "string" ||
    (payload.desiredOutcome !== "completed" &&
      payload.desiredOutcome !== "waiting_approval")
  ) {
    return
  }
  return {
    applicationRunId: payload.applicationRunId,
    desiredOutcome: payload.desiredOutcome,
  }
}

const reconcileMemoryCommitOnce = async (
  mastra: Mastra,
  api: Pick<AgentControlPlanePort, "settleMemoryCommit">,
  input: {
    applicationRunId: string
    desiredOutcome: MemoryCommitOutcome
  }
): Promise<"committed"> => {
  const workflow = mastra.getWorkflow("memoryCommitWorkflow")
  const runId = memoryCommitWorkflowRunId(input.applicationRunId)
  const retryResume = async (attempt: number): Promise<void> => {
    await new Promise((resolve) =>
      setTimeout(resolve, MEMORY_COMMIT_RETRY_DELAY_MS * 2 ** attempt)
    )
    return resumeUntilSettled(attempt + 1)
  }
  const resumeUntilSettled = async (attempt: number): Promise<void> => {
    const run = await workflow.createRun({ runId })
    let result: Awaited<ReturnType<typeof run.resume>>
    try {
      result = await run.resume({
        resumeData: { action: "persist" },
        step: MEMORY_COMMIT_STEP_ID,
        tracingOptions: { hideInput: true, hideOutput: true },
      })
    } catch (cause) {
      if (attempt + 1 < MAX_MEMORY_COMMIT_RESUME_ATTEMPTS) {
        return retryResume(attempt)
      }
      throw cause
    }
    if (result.status === "success") {
      return
    }
    if (
      result.status === "suspended" &&
      attempt + 1 < MAX_MEMORY_COMMIT_RESUME_ATTEMPTS
    ) {
      return retryResume(attempt)
    }
    throw new Error("Memory commit is still pending")
  }

  let current = await workflow.getWorkflowRunById(runId)
  if (!current) throw new Error("Memory commit is unavailable")
  if (current.status === "running") {
    const running = await workflow.createRun({ runId })
    await running.restart()
    current = await workflow.getWorkflowRunById(runId)
    if (!current) throw new Error("Memory commit is unavailable")
  }
  const storedInput = readReconcileInput(current)
  if (
    !storedInput ||
    storedInput.applicationRunId !== input.applicationRunId ||
    storedInput.desiredOutcome !== input.desiredOutcome
  ) {
    throw new Error("Memory commit is unavailable")
  }
  if (current.status === "suspended") {
    await resumeUntilSettled(0)
  } else if (current.status !== "success") {
    throw new Error("Memory commit is unavailable")
  }
  if (storedInput.desiredOutcome === "completed") {
    await api.settleMemoryCommit({
      applicationRunId: storedInput.applicationRunId,
    })
  }
  await workflow.deleteWorkflowRunById(runId)
  return "committed"
}

export const reconcileMemoryCommit = (
  mastra: Mastra,
  api: Pick<AgentControlPlanePort, "settleMemoryCommit">,
  input: {
    applicationRunId: string
    desiredOutcome: MemoryCommitOutcome
  }
) => {
  const runId = memoryCommitWorkflowRunId(input.applicationRunId)
  const active = activeReconciliations.get(runId)
  if (active) return active
  const reconciliation = reconcileMemoryCommitOnce(mastra, api, input).finally(
    () => {
      if (activeReconciliations.get(runId) === reconciliation) {
        activeReconciliations.delete(runId)
      }
    }
  )
  activeReconciliations.set(runId, reconciliation)
  return reconciliation
}

const listPendingMemoryCommitRunsForResources = async (
  mastra: Mastra,
  resourceIds: ReadonlySet<string>
) => {
  if (resourceIds.size === 0) return []
  const workflow = mastra.getWorkflow("memoryCommitWorkflow")
  const onlyResourceId =
    resourceIds.size === 1 ? resourceIds.values().next().value : undefined
  const listStatus = async (
    status: (typeof PENDING_MEMORY_COMMIT_STATUSES)[number],
    page = 0,
    accumulated: Awaited<
      ReturnType<typeof workflow.listWorkflowRuns>
    >["runs"] = []
  ): Promise<typeof accumulated> => {
    const result = await workflow.listWorkflowRuns({
      page,
      perPage: MEMORY_COMMIT_SCAN_PAGE_SIZE,
      ...(onlyResourceId ? { resourceId: onlyResourceId } : {}),
      status,
    })
    if (result.total > MAX_MEMORY_COMMIT_SCAN_RUNS) {
      throw new Error("Memory commit scan is unavailable")
    }
    accumulated.push(
      ...result.runs.filter(
        ({ resourceId }) =>
          resourceId !== undefined && resourceIds.has(resourceId)
      )
    )
    if (
      (page + 1) * MEMORY_COMMIT_SCAN_PAGE_SIZE >= result.total ||
      result.runs.length === 0
    ) {
      return accumulated
    }
    return listStatus(status, page + 1, accumulated)
  }
  return (
    await Promise.all(
      PENDING_MEMORY_COMMIT_STATUSES.map((status) => listStatus(status))
    )
  ).flat()
}

export const hasPendingMemoryCommits = async (
  mastra: Mastra,
  threadIds: readonly string[]
) =>
  (await listPendingMemoryCommitRunsForResources(mastra, new Set(threadIds)))
    .length > 0

export const hasPendingMemoryCommit = (mastra: Mastra, threadId: string) =>
  hasPendingMemoryCommits(mastra, [threadId])

export const reconcilePendingMemoryCommits = async (
  mastra: Mastra,
  api: Pick<AgentControlPlanePort, "settleMemoryCommit">
) => reconcilePendingMemoryCommitRuns(mastra, api)

const reconcilePendingMemoryCommitRuns = async (
  mastra: Mastra,
  api: Pick<AgentControlPlanePort, "settleMemoryCommit">,
  resourceIds?: ReadonlySet<string>
) => {
  const workflow = mastra.getWorkflow("memoryCommitWorkflow")
  const runs = resourceIds
    ? await listPendingMemoryCommitRunsForResources(mastra, resourceIds)
    : (
        await Promise.all(
          PENDING_MEMORY_COMMIT_STATUSES.map((status) =>
            workflow.listWorkflowRuns({
              page: 0,
              perPage: 25,
              status,
            })
          )
        )
      ).flatMap(({ runs: pageRuns }) => pageRuns)
  const reconcileNext = async (index: number): Promise<void> => {
    const stored = runs[index]
    if (!stored) return
    const current = await workflow.getWorkflowRunById(stored.runId)
    const input = current ? readReconcileInput(current) : undefined
    if (input) await reconcileMemoryCommit(mastra, api, input)
    await reconcileNext(index + 1)
  }
  await reconcileNext(0)
}

export const reconcilePendingMemoryCommitsForThread = (
  mastra: Mastra,
  api: Pick<AgentControlPlanePort, "settleMemoryCommit">,
  threadId: string
) => reconcilePendingMemoryCommitsForThreads(mastra, api, [threadId])

export const reconcilePendingMemoryCommitsForThreads = (
  mastra: Mastra,
  api: Pick<AgentControlPlanePort, "settleMemoryCommit">,
  threadIds: readonly string[]
) => reconcilePendingMemoryCommitRuns(mastra, api, new Set(threadIds))
