import type { MastraDBMessage } from "@mastra/core/agent"
import { Mastra } from "@mastra/core/mastra"
import type { Memory } from "@mastra/memory"
import { describe, expect, it, vi } from "vitest"

import { createAgentStorage } from "../../storage"
import { createMemoryCommitWorkflow, suspendMemoryCommit } from "./workflow"
import {
  memoryCommitWorkflowRunId,
  stableMemoryCommitMessages,
  MEMORY_COMMIT_STEP_ID,
} from "./workflow-contract"

const message = (): MastraDBMessage => ({
  id: "provider-message-id",
  role: "assistant",
  createdAt: new Date("2026-07-28T00:00:00.000Z"),
  threadId: "thread_1",
  resourceId: "resource_1",
  content: { format: 2, parts: [{ type: "text", text: "saved" }] },
})

const messageWithId = (id: string): MastraDBMessage => ({
  ...message(),
  id,
})

type SaveMessages = Pick<Memory, "saveMessages">["saveMessages"]

const createRuntime = (
  saveMessages = vi
    .fn<SaveMessages>()
    .mockImplementation(({ messages }) => Promise.resolve({ messages }))
) => {
  const storage = createAgentStorage(
    { MASTRA_STORAGE_URL: ":memory:", NODE_ENV: "test" },
    `memory-commit-contract-${crypto.randomUUID()}`
  )
  const memoryCommitWorkflow = createMemoryCommitWorkflow({ saveMessages })
  return {
    mastra: new Mastra({
      logger: false,
      storage,
      workflows: { memoryCommitWorkflow },
    }),
    saveMessages,
  }
}

describe("memory commit workflow contract", () => {
  it("derives stable workflow and message ids from the application run", () => {
    expect(memoryCommitWorkflowRunId("run_1")).toBe("memory_commit_run_1")
    expect(stableMemoryCommitMessages([message()])).toMatchObject([
      { id: "provider-message-id" },
    ])
  })

  it("rejects duplicate and invalid message ids", () => {
    expect(() =>
      stableMemoryCommitMessages([
        messageWithId("message_duplicate"),
        messageWithId("message_duplicate"),
      ])
    ).toThrow("Memory commit batch is invalid")
    expect(() =>
      stableMemoryCommitMessages([messageWithId("message invalid")])
    ).toThrow("Memory commit batch is invalid")
  })

  it("accepts exactly 1000 messages and rejects the next message", () => {
    const maximum = Array.from({ length: 1_000 }, (_, index) =>
      messageWithId(`message_${index}`)
    )
    expect(stableMemoryCommitMessages(maximum)).toHaveLength(1_000)
    expect(() =>
      stableMemoryCommitMessages([
        ...maximum,
        messageWithId("message_over_limit"),
      ])
    ).toThrow("Memory commit batch is invalid")
  })

  it("applies the snapshot limit to UTF-8 bytes rather than characters", async () => {
    const { mastra, saveMessages } = createRuntime()
    const multibyte = Array.from({ length: 20 }, (_, index) => {
      const value = messageWithId(`message_multibyte_${index}`)
      value.content.parts = [{ type: "text", text: "界".repeat(50_000) }]
      return value
    })

    await expect(
      suspendMemoryCommit(mastra, {
        applicationRunId: "run_multibyte",
        desiredOutcome: "completed",
        messages: multibyte,
        resourceId: "resource_1",
        threadId: "thread_1",
      })
    ).rejects.toThrow("Memory commit batch is invalid")
    expect(saveMessages).not.toHaveBeenCalled()
  })

  it("persists a snapshot before saving Memory and retries a failed save", async () => {
    const saveMessages = vi
      .fn<SaveMessages>()
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockResolvedValueOnce({ messages: [message()] })
    const { mastra } = createRuntime(saveMessages)
    await suspendMemoryCommit(mastra, {
      applicationRunId: "run_1",
      desiredOutcome: "completed",
      messages: [message()],
      resourceId: "resource_1",
      threadId: "thread_1",
    })
    const workflow = mastra.getWorkflow("memoryCommitWorkflow")
    const workflowRunId = memoryCommitWorkflowRunId("run_1")
    await expect(
      workflow.getWorkflowRunById(workflowRunId)
    ).resolves.toMatchObject({ status: "suspended" })

    const firstResume = await (
      await workflow.createRun({ runId: workflowRunId })
    ).resume({
      resumeData: { action: "persist" },
      step: MEMORY_COMMIT_STEP_ID,
    })
    expect(firstResume.status).toBe("suspended")
    const secondResume = await (
      await workflow.createRun({ runId: workflowRunId })
    ).resume({
      resumeData: { action: "persist" },
      step: MEMORY_COMMIT_STEP_ID,
    })
    expect(secondResume.status).toBe("success")
    expect(saveMessages).toHaveBeenCalledTimes(2)
    expect(saveMessages.mock.calls[1]?.[0]).toMatchObject({
      messages: [{ id: "provider-message-id" }],
    })
  })
})
