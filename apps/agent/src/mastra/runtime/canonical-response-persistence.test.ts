import type { MastraDBMessage } from "@mastra/core/agent"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  reconcileMemoryCommit,
  suspendMemoryCommit,
} from "../workflows/memory-commit"
import { createCanonicalResponsePersistence } from "./canonical-response-persistence"
import type { AgentControlPlanePort } from "./ports"

vi.mock("../workflows/memory-commit", () => ({
  reconcileMemoryCommit: vi.fn<typeof reconcileMemoryCommit>(),
  suspendMemoryCommit: vi.fn<typeof suspendMemoryCommit>(),
}))

const mockedSuspend = vi.mocked(suspendMemoryCommit)
const mockedReconcile = vi.mocked(reconcileMemoryCommit)
type PersistenceInput = Parameters<typeof createCanonicalResponsePersistence>[0]
const mastra: PersistenceInput["mastra"] = Object.create(null)
const message: MastraDBMessage = {
  id: "message_1",
  role: "assistant",
  createdAt: new Date("2026-07-28T00:00:00.000Z"),
  threadId: "thread_1",
  resourceId: "resource_1",
  content: { format: 2, parts: [{ type: "text", text: "saved" }] },
}

describe("canonical response persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedSuspend.mockResolvedValue(undefined)
    mockedReconcile.mockResolvedValue("committed")
  })

  it("stages in Mastra Storage before settling the application run", async () => {
    const messages = [message]
    const input: PersistenceInput = {
      api: {
        settleMemoryCommit:
          vi.fn<AgentControlPlanePort["settleMemoryCommit"]>(),
      },
      applicationRunId: "run_1",
      drainMessages: vi.fn<() => MastraDBMessage[]>(() => messages),
      mastra,
      memoryResourceId: "resource_1",
      threadId: "thread_1",
    }
    const persistence = createCanonicalResponsePersistence(input)

    await persistence.stage("completed")
    await persistence.commit()

    expect(mockedSuspend).toHaveBeenCalledWith(input.mastra, {
      applicationRunId: "run_1",
      desiredOutcome: "completed",
      messages,
      resourceId: "resource_1",
      threadId: "thread_1",
    })
    expect(mockedReconcile).toHaveBeenCalledWith(input.mastra, input.api, {
      applicationRunId: "run_1",
      desiredOutcome: "completed",
    })
  })

  it("drains a generated response at most once", async () => {
    const persistence = createCanonicalResponsePersistence({
      api: {
        settleMemoryCommit:
          vi.fn<AgentControlPlanePort["settleMemoryCommit"]>(),
      },
      applicationRunId: "run_1",
      drainMessages: () => [],
      mastra,
      memoryResourceId: "resource_1",
      threadId: "thread_1",
    })

    await persistence.stage("waiting_approval")
    await expect(persistence.stage("waiting_approval")).rejects.toThrow(
      "Memory batch already drained"
    )
  })
})
