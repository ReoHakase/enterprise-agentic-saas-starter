import type { AgentUiMessage } from "@enterprise-agentic-saas/agent-contracts"
import type { MastraMemory } from "@mastra/core/memory"
import { Memory } from "@mastra/memory"
import { describe, expect, it, vi } from "vitest"

import type { AgentFailureCode } from "../adapters/telemetry/capture"
import { createThreadTitleAgent } from "../agents/thread-title-agent"
import { createAgentStorage } from "../storage"
import { createScriptedModel } from "../test-support/scripted-model"
import type { AgentControlPlanePort } from "./ports"
import { createThreadTitleTask } from "./thread-title"

const message: AgentUiMessage = {
  id: "message_title",
  role: "user",
  parts: [{ type: "text", text: "認証境界の不具合を調査して" }],
}

describe("thread title lifecycle", () => {
  it("keeps the title task pending, then persists and records separate usage exactly once", async () => {
    const storage = createAgentStorage(
      { MASTRA_STORAGE_URL: ":memory:", NODE_ENV: "test" },
      "thread-title-lifecycle"
    )
    const memory = new Memory({
      storage,
      options: { generateTitle: false },
    })
    await memory.createThread({
      resourceId: "resource_title",
      threadId: "thread_title",
      title: "New conversation",
    })
    const titleAgent = createThreadTitleAgent(
      createScriptedModel([
        {
          delayMs: 30,
          parts: [{ type: "text", text: "認証境界の不具合調査" }],
          usage: { inputTokens: 8, outputTokens: 4 },
        },
      ])
    )
    const recordUsage = vi
      .fn<Pick<AgentControlPlanePort, "recordUsage">["recordUsage"]>()
      .mockResolvedValue({
        calculatedCostMicros: 0,
        pricingVersion: "test",
        recorded: true,
      })
    let settled = false

    const task = createThreadTitleTask({
      api: { recordUsage },
      attempt: 1,
      captureFailure: vi.fn<(code: AgentFailureCode) => void>(),
      memory,
      message,
      resourceId: "resource_title",
      runGrant: "run_0123456789abcdefghijklmnopqrstuvwxyz",
      threadId: "thread_title",
      titleAgent,
    }).then(() => {
      settled = true
      return undefined
    })

    await Promise.resolve()
    expect(settled).toBe(false)
    await task
    expect(
      await memory.getThreadById({ threadId: "thread_title" })
    ).toMatchObject({
      resourceId: "resource_title",
      title: "認証境界の不具合調査",
    })
    expect(recordUsage).toHaveBeenCalledOnce()
    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ runEventId: "title_1" })
    )
    await storage.close()
  })

  it("does not overwrite a non-default title or spend model usage", async () => {
    const storage = createAgentStorage(
      { MASTRA_STORAGE_URL: ":memory:", NODE_ENV: "test" },
      "thread-title-existing"
    )
    const memory = new Memory({ storage, options: { generateTitle: false } })
    await memory.createThread({
      resourceId: "resource_title",
      threadId: "thread_existing",
      title: "Existing title",
    })
    const recordUsage =
      vi.fn<Pick<AgentControlPlanePort, "recordUsage">["recordUsage"]>()
    await createThreadTitleTask({
      api: { recordUsage },
      attempt: 1,
      captureFailure: vi.fn<(code: AgentFailureCode) => void>(),
      memory,
      message,
      resourceId: "resource_title",
      runGrant: "run_0123456789abcdefghijklmnopqrstuvwxyz",
      threadId: "thread_existing",
      titleAgent: createThreadTitleAgent(
        createScriptedModel([
          { parts: [{ type: "text", text: "Replacement" }] },
        ])
      ),
    })

    expect(recordUsage).not.toHaveBeenCalled()
    expect(
      await memory.getThreadById({ threadId: "thread_existing" })
    ).toMatchObject({ title: "Existing title" })
    await storage.close()
  })

  it("records model usage even when title persistence fails", async () => {
    const recordUsage = vi
      .fn<Pick<AgentControlPlanePort, "recordUsage">["recordUsage"]>()
      .mockResolvedValue({
        calculatedCostMicros: 0,
        pricingVersion: "test",
        recorded: true,
      })
    const memory: MastraMemory = Object.assign(JSON.parse("{}"), {
      getThreadById: vi.fn<MastraMemory["getThreadById"]>().mockResolvedValue({
        createdAt: new Date("2026-07-28T00:00:00.000Z"),
        id: "thread_failed",
        metadata: {},
        resourceId: "resource_title",
        title: "New conversation",
        updatedAt: new Date("2026-07-28T00:00:00.000Z"),
      }),
      updateThread: vi
        .fn<MastraMemory["updateThread"]>()
        .mockRejectedValue(new Error("storage failed")),
    })

    await expect(
      createThreadTitleTask({
        api: { recordUsage },
        attempt: 2,
        captureFailure: vi.fn<(code: AgentFailureCode) => void>(),
        memory,
        message,
        resourceId: "resource_title",
        runGrant: "run_0123456789abcdefghijklmnopqrstuvwxyz",
        threadId: "thread_failed",
        titleAgent: createThreadTitleAgent(
          createScriptedModel([
            {
              parts: [{ type: "text", text: "Persisted title" }],
              usage: { inputTokens: 1, outputTokens: 1 },
            },
          ])
        ),
      })
    ).rejects.toThrow("storage failed")
    expect(recordUsage).toHaveBeenCalledOnce()
    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ runEventId: "title_2" })
    )
  })
})
