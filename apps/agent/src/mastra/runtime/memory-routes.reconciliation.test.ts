import { Memory } from "@mastra/memory"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createAgentRuntimeComposition } from "../composition/runtime-composition"
import {
  hasPendingMemoryCommit,
  suspendMemoryCommit,
} from "../workflows/memory-commit"
import { handleMemoryHistory, handleMemoryThreads } from "./memory-routes"
import type { AgentControlPlanePort } from "./ports"

const threadId = "thread_reconciliation"
const secondThreadId = "thread_reconciliation_2"
const resourceId = "resource_reconciliation"
const now = new Date("2026-07-28T00:00:00.000Z")
const openCompositions: ReturnType<typeof createAgentRuntimeComposition>[] = []

const createComposition = async () => {
  const composition = createAgentRuntimeComposition({
    AGENT_RUNS_ENABLED: "1",
    AGENT_VISION_ENABLED: "0",
    AGENT_WRITES_ENABLED: "0",
    MASTRA_STORAGE_URL: ":memory:",
    NODE_ENV: "test",
    SENTRY_ENVIRONMENT: "test",
  })
  await composition.storage.init()
  openCompositions.push(composition)
  return composition
}

const connectionTicketResult = (): Awaited<
  ReturnType<AgentControlPlanePort["consumeConnectionTicket"]>
> => ({
  grant: "grant_reconciliation_1234567890123456",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  memoryResourceId: resourceId,
  user: { name: "Reconciliation User", profileImage: null },
  organization: {
    name: "Reconciliation Org",
    slug: "reconciliation-org",
    role: "member" as const,
    permissions: {
      canReadIssues: true,
      canCreateIssues: true,
      canUpdateIssues: true,
      canDeleteOwnIssues: true,
      canDeleteAnyIssue: false,
    },
  },
  thread: { id: threadId, title: "Reconciliation thread" },
})

const consumeConnectionTicket: AgentControlPlanePort["consumeConnectionTicket"] =
  () => Promise.resolve(connectionTicketResult())

const memoryRequest = (path: "history" | "threads", body: object) =>
  new Request(`https://agent.internal/memory/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, threadId, ticket: "ticket_1" }),
  })

const saveThread = (memory: Memory, id: string, title: string) =>
  memory.saveThread({
    thread: {
      id,
      resourceId,
      createdAt: now,
      updatedAt: now,
      title,
      metadata: {},
    },
  })

const suspendResponse = (
  composition: ReturnType<typeof createAgentRuntimeComposition>,
  input: {
    applicationRunId: string
    messageId: string
    text: string
    threadId: string
  }
) =>
  suspendMemoryCommit(composition.mastra, {
    applicationRunId: input.applicationRunId,
    desiredOutcome: "completed",
    messages: [
      {
        id: input.messageId,
        role: "assistant",
        createdAt: now,
        threadId: input.threadId,
        resourceId,
        content: {
          format: 2,
          parts: [{ type: "text", text: input.text }],
        },
      },
    ],
    resourceId,
    threadId: input.threadId,
  })

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    openCompositions.splice(0).map(({ storage }) => storage.close())
  )
})

describe("Memory read reconciliation", () => {
  it("awaits the authenticated thread commit before returning complete history and thread metadata", async () => {
    const composition = await createComposition()
    const memory = await composition.productAgent.getMemory()
    if (!(memory instanceof Memory)) throw new Error("Memory unavailable")
    await saveThread(memory, threadId, "Reconciliation thread")
    await suspendResponse(composition, {
      applicationRunId: "run_reconciliation",
      messageId: "message_reconciliation",
      text: "Recovered response",
      threadId,
    })
    const settleMemoryCommit = vi.fn<
      AgentControlPlanePort["settleMemoryCommit"]
    >((input) =>
      Promise.resolve({
        acknowledged: true,
        applicationRunId: input.applicationRunId,
      })
    )
    const dependencies: Parameters<typeof handleMemoryHistory>[2] = {
      mastra: composition.mastra,
      createControlPlane: () => ({
        consumeConnectionTicket,
        settleMemoryCommit,
      }),
    }
    const environment: Parameters<typeof handleMemoryHistory>[1] = {
      AGENT_INTERNAL_API: {},
    }

    const history = await handleMemoryHistory(
      memoryRequest("history", { page: 0, perPage: 100 }),
      environment,
      dependencies
    )
    const threads = await handleMemoryThreads(
      memoryRequest("threads", { registryThreadIds: [threadId] }),
      environment,
      dependencies
    )

    expect(history.status).toBe(200)
    expect(JSON.stringify(await history.json())).toContain("Recovered response")
    expect(threads.status).toBe(200)
    expect(await threads.json()).toEqual([
      expect.objectContaining({ id: threadId }),
    ])
    expect(settleMemoryCommit).toHaveBeenCalledOnce()
    await expect(
      hasPendingMemoryCommit(composition.mastra, threadId)
    ).resolves.toBe(false)
  })

  it.each(["history", "threads"] as const)(
    "reconciles %s before consuming a revocable connection ticket",
    async (path) => {
      const composition = await createComposition()
      const memory = await composition.productAgent.getMemory()
      if (!(memory instanceof Memory)) throw new Error("Memory unavailable")
      await saveThread(memory, threadId, "Reconciliation thread")
      await suspendResponse(composition, {
        applicationRunId: `run_revoked_${path}`,
        messageId: `message_revoked_${path}`,
        text: "Recovered before authorization",
        threadId,
      })

      const settlementStarted = Promise.withResolvers<void>()
      const settlementGate = Promise.withResolvers<void>()
      const settleMemoryCommit = vi.fn<
        AgentControlPlanePort["settleMemoryCommit"]
      >(async (input) => {
        settlementStarted.resolve()
        await settlementGate.promise
        return {
          acknowledged: true,
          applicationRunId: input.applicationRunId,
        }
      })
      const revokedTicket = vi
        .fn<AgentControlPlanePort["consumeConnectionTicket"]>()
        .mockRejectedValue(new Error("connection revoked"))
      const dependencies: Parameters<typeof handleMemoryHistory>[2] = {
        mastra: composition.mastra,
        createControlPlane: () => ({
          consumeConnectionTicket: revokedTicket,
          settleMemoryCommit,
        }),
      }
      const environment = { AGENT_INTERNAL_API: {} }

      const responsePromise =
        path === "history"
          ? handleMemoryHistory(
              memoryRequest("history", { page: 0, perPage: 100 }),
              environment,
              dependencies
            )
          : handleMemoryThreads(
              memoryRequest("threads", {
                registryThreadIds: [threadId],
              }),
              environment,
              dependencies
            )
      await settlementStarted.promise
      expect(revokedTicket).not.toHaveBeenCalled()
      settlementGate.resolve()

      await expect(responsePromise).resolves.toMatchObject({ status: 503 })
      expect(revokedTicket).toHaveBeenCalledOnce()
    }
  )

  it("fails a thread list closed until every requested thread is reconciled", async () => {
    const composition = await createComposition()
    const memory = await composition.productAgent.getMemory()
    if (!(memory instanceof Memory)) throw new Error("Memory unavailable")
    await Promise.all([
      saveThread(memory, threadId, "First thread"),
      saveThread(memory, secondThreadId, "Second thread"),
    ])
    await suspendResponse(composition, {
      applicationRunId: "run_second_thread",
      messageId: "message_second_thread",
      text: "Second thread recovered",
      threadId: secondThreadId,
    })

    const settleMemoryCommit = vi
      .fn<AgentControlPlanePort["settleMemoryCommit"]>()
      .mockRejectedValueOnce(new Error("application settlement unavailable"))
      .mockImplementation((input) =>
        Promise.resolve({
          acknowledged: true,
          applicationRunId: input.applicationRunId,
        })
      )
    const ticket = vi.fn<AgentControlPlanePort["consumeConnectionTicket"]>(
      consumeConnectionTicket
    )
    const dependencies: Parameters<typeof handleMemoryThreads>[2] = {
      mastra: composition.mastra,
      createControlPlane: () => ({
        consumeConnectionTicket: ticket,
        settleMemoryCommit,
      }),
    }
    const environment = { AGENT_INTERNAL_API: {} }
    const request = () =>
      memoryRequest("threads", {
        registryThreadIds: [threadId, secondThreadId],
      })

    const unavailable = await handleMemoryThreads(
      request(),
      environment,
      dependencies
    )
    expect(unavailable.status).toBe(503)
    expect(ticket).not.toHaveBeenCalled()
    await expect(
      hasPendingMemoryCommit(composition.mastra, secondThreadId)
    ).resolves.toBe(true)

    const recovered = await handleMemoryThreads(
      request(),
      environment,
      dependencies
    )
    expect(recovered.status).toBe(200)
    expect(await recovered.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: threadId }),
        expect.objectContaining({ id: secondThreadId }),
      ])
    )
    expect(ticket).toHaveBeenCalledOnce()
    await expect(
      hasPendingMemoryCommit(composition.mastra, secondThreadId)
    ).resolves.toBe(false)
  })

  it("reconciles a selected thread from the second workflow page before consuming the ticket", async () => {
    const composition = await createComposition()
    const memory = await composition.productAgent.getMemory()
    if (!(memory instanceof Memory)) throw new Error("Memory unavailable")
    await Promise.all([
      saveThread(memory, threadId, "First thread"),
      saveThread(memory, secondThreadId, "Second thread"),
    ])
    await suspendResponse(composition, {
      applicationRunId: "run_second_page",
      messageId: "message_second_page",
      text: "Recovered from the second page",
      threadId: secondThreadId,
    })

    const workflow = composition.mastra.getWorkflow("memoryCommitWorkflow")
    const originalListWorkflowRuns = workflow.listWorkflowRuns.bind(workflow)
    const stored = await originalListWorkflowRuns({
      page: 0,
      perPage: 100,
      status: "suspended",
    })
    const target = stored.runs.find(
      ({ resourceId: storedResourceId }) => storedResourceId === secondThreadId
    )
    if (!target) throw new Error("Pending workflow unavailable")
    const unrelatedFirstPage = Array.from({ length: 100 }, (_, index) => ({
      ...target,
      resourceId: `unselected_thread_${index}`,
      runId: `unselected_run_${index}`,
    }))
    const listWorkflowRuns = vi
      .spyOn(workflow, "listWorkflowRuns")
      .mockImplementation(async (input) => {
        if (input?.status !== "suspended") return { runs: [], total: 0 }
        if (input.page === 0) {
          return { runs: unrelatedFirstPage, total: 101 }
        }
        if (input.page === 1) {
          const actual = await originalListWorkflowRuns({
            ...input,
            page: 0,
          })
          return { runs: actual.runs, total: 101 }
        }
        return { runs: [], total: 101 }
      })

    const settleMemoryCommit = vi.fn<
      AgentControlPlanePort["settleMemoryCommit"]
    >((input) =>
      Promise.resolve({
        acknowledged: true,
        applicationRunId: input.applicationRunId,
      })
    )
    const ticket = vi.fn<AgentControlPlanePort["consumeConnectionTicket"]>(
      consumeConnectionTicket
    )
    const response = await handleMemoryThreads(
      memoryRequest("threads", {
        registryThreadIds: [threadId, secondThreadId],
      }),
      { AGENT_INTERNAL_API: {} },
      {
        mastra: composition.mastra,
        createControlPlane: () => ({
          consumeConnectionTicket: ticket,
          settleMemoryCommit,
        }),
      }
    )

    expect(response.status).toBe(200)
    expect(settleMemoryCommit).toHaveBeenCalledOnce()
    expect(ticket).toHaveBeenCalledOnce()
    expect(listWorkflowRuns).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, status: "suspended" })
    )
    await expect(
      hasPendingMemoryCommit(composition.mastra, secondThreadId)
    ).resolves.toBe(false)
  })

  it("does not consume a thread-list ticket when the workflow scan exceeds its bound", async () => {
    const composition = await createComposition()
    const workflow = composition.mastra.getWorkflow("memoryCommitWorkflow")
    vi.spyOn(workflow, "listWorkflowRuns").mockResolvedValue({
      runs: [],
      total: 10_001,
    })
    const ticket = vi.fn<AgentControlPlanePort["consumeConnectionTicket"]>(
      consumeConnectionTicket
    )

    const response = await handleMemoryThreads(
      memoryRequest("threads", { registryThreadIds: [threadId] }),
      { AGENT_INTERNAL_API: {} },
      {
        mastra: composition.mastra,
        createControlPlane: () => ({
          consumeConnectionTicket: ticket,
          settleMemoryCommit: (input) =>
            Promise.resolve({
              acknowledged: true,
              applicationRunId: input.applicationRunId,
            }),
        }),
      }
    )

    expect(response.status).toBe(503)
    expect(ticket).not.toHaveBeenCalled()
  })
})
