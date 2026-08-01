import { Memory } from "@mastra/memory"
import { describe, expect, it, vi } from "vitest"

import type { AgentFailureCode } from "../adapters/telemetry/capture"
import { createAgentRuntimeComposition } from "../composition/runtime-composition"
import { handleMemoryHistory, handleMemoryThreads } from "./memory-routes"

const request = (path: string, body: unknown) =>
  new Request(`https://agent.internal${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  })

describe("App registry to Agent Memory boundary", () => {
  it("records a fixed code when an operational Memory boundary fails", async () => {
    const composition = createAgentRuntimeComposition({
      AGENT_RUNS_ENABLED: "1",
      AGENT_VISION_ENABLED: "0",
      AGENT_WRITES_ENABLED: "0",
      MASTRA_STORAGE_URL: ":memory:",
      NODE_ENV: "test",
    })
    const cause = new Error("private connection failure")
    const captureFailure = vi.fn<(code: AgentFailureCode) => void>()

    try {
      await composition.storage.init()
      const response = await handleMemoryHistory(
        request("/memory/history", {
          page: 0,
          perPage: 40,
          threadId: "thread_failure",
          ticket: "ticket_failure",
        }),
        { AGENT_INTERNAL_API: {}, NODE_ENV: "test" },
        {
          captureFailure,
          createControlPlane: () => ({
            consumeConnectionTicket: () => Promise.reject(cause),
          }),
          mastra: composition.mastra,
        }
      )

      expect(response.status).toBe(503)
      expect(captureFailure).toHaveBeenCalledOnce()
      expect(captureFailure).toHaveBeenCalledWith("memory_failed")
    } finally {
      await composition.storage.close()
    }
  })

  it("reads Mastra Memory through a single-use authorized connection", async () => {
    const composition = createAgentRuntimeComposition({
      AGENT_RUNS_ENABLED: "1",
      AGENT_VISION_ENABLED: "0",
      AGENT_WRITES_ENABLED: "0",
      MASTRA_STORAGE_URL: ":memory:",
      NODE_ENV: "test",
    })
    await composition.storage.init()
    const memory = await composition.productAgent.getMemory()
    if (!(memory instanceof Memory)) throw new Error("Memory unavailable")

    const now = new Date("2026-08-01T00:00:00.000Z")
    const resourceId = "resource_org_a_user_a"
    const threadId = "thread_boundary"
    await memory.saveThread({
      thread: {
        id: threadId,
        resourceId,
        createdAt: now,
        updatedAt: now,
        title: "Persisted boundary thread",
        metadata: {},
      },
    })
    await memory.saveMessages({
      messages: [
        {
          id: "message_boundary",
          role: "assistant",
          createdAt: now,
          threadId,
          resourceId,
          content: {
            format: 2,
            parts: [
              {
                type: "text",
                text: "Persisted boundary message",
                providerMetadata: {
                  privateProvider: {
                    token: "PRIVATE_PROVIDER_METADATA_SENTINEL",
                  },
                },
              },
              {
                type: "source",
                source: {
                  sourceType: "url",
                  id: "source:opaque|1",
                  title: "Public source",
                  url: "https://example.com/docs?sig=PRIVATE_SIGNATURE",
                },
              },
              {
                type: "tool-invocation",
                toolInvocation: {
                  state: "result",
                  toolCallId: "call:get-issue|opaque",
                  toolName: "get_issue",
                  args: {
                    attachmentCursor: null,
                    attachmentLimit: 100,
                    id: null,
                    lookup: "number",
                    number: 42,
                  },
                  result: { priority: "urgent" },
                },
              },
              {
                type: "tool-invocation",
                toolInvocation: {
                  state: "result",
                  toolCallId: "call:skill|opaque",
                  toolName: "skill",
                  args: { name: "issue-triage" },
                  result: "PRIVATE_SKILL_INSTRUCTIONS_SENTINEL",
                },
              },
            ],
          },
        },
      ],
    })

    const tickets = new Set(["ticket_history", "ticket_threads"])
    const dependencies: Parameters<typeof handleMemoryHistory>[2] = {
      mastra: composition.mastra,
      createControlPlane: () => ({
        consumeConnectionTicket: async ({ ticket, threadId: requested }) => {
          if (!tickets.delete(ticket) || requested !== threadId) {
            throw new Error("Agent capability is invalid")
          }
          return {
            grant: "grant_0123456789abcdefghijklmnopqrstuvwxyz",
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            memoryResourceId: resourceId,
            user: { name: "Boundary User", profileImage: null },
            organization: {
              name: "Boundary Org",
              slug: "boundary-org",
              role: "member",
              permissions: {
                canReadIssues: true,
                canCreateIssues: true,
                canUpdateIssues: true,
                canDeleteOwnIssues: true,
                canDeleteAnyIssue: false,
              },
            },
            thread: { id: threadId, title: "Boundary thread" },
          }
        },
      }),
    }
    const environment = { AGENT_INTERNAL_API: {} }

    try {
      const history = await handleMemoryHistory(
        request("/memory/history", {
          page: 0,
          perPage: 40,
          threadId,
          ticket: "ticket_history",
        }),
        environment,
        dependencies
      )
      expect(history.status).toBe(200)
      const body = await history.json()
      expect(body).toMatchObject({
        messages: [{ id: "message_boundary" }],
        total: 1,
      })
      expect(JSON.stringify(body)).toContain("https://example.com/docs")
      expect(JSON.stringify(body)).not.toContain("PRIVATE_SIGNATURE")
      expect(body).toMatchObject({
        messages: [
          {
            parts: expect.arrayContaining([
              expect.objectContaining({
                input: expect.objectContaining({
                  id: null,
                  lookup: "number",
                  number: 42,
                }),
                output: { priority: "urgent" },
                state: "output-available",
                toolCallId: "call:get-issue|opaque",
                type: "tool-get_issue",
              }),
              expect.objectContaining({
                input: { name: "issue-triage" },
                output: { activated: true },
                state: "output-available",
                toolCallId: "call:skill|opaque",
                type: "tool-skill",
              }),
            ]),
          },
        ],
      })
      expect(JSON.stringify(body)).not.toContain(
        "PRIVATE_PROVIDER_METADATA_SENTINEL"
      )
      expect(JSON.stringify(body)).not.toContain(
        "PRIVATE_SKILL_INSTRUCTIONS_SENTINEL"
      )

      const threads = await handleMemoryThreads(
        request("/memory/threads", {
          registryThreadIds: [threadId],
          threadId,
          ticket: "ticket_threads",
        }),
        environment,
        dependencies
      )
      expect(await threads.json()).toEqual([
        expect.objectContaining({
          id: threadId,
          title: "Persisted boundary thread",
        }),
      ])
    } finally {
      await composition.storage.close()
    }
  })
})
