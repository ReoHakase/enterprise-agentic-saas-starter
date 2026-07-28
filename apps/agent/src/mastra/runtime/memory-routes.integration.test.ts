import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"

import { Memory } from "@mastra/memory"
import { describe, expect, it } from "vitest"

import { createAgentRuntimeComposition } from "../composition/runtime-composition"
import {
  reconcileMemoryCommit,
  reconcilePendingMemoryCommits,
  suspendMemoryCommit,
} from "../workflows/memory-commit"
import { handleMemoryHistory, handleMemoryThreads } from "./memory-routes"
import type { AgentControlPlanePort } from "./ports"

const toolHistoryParts = () =>
  JSON.parse(
    JSON.stringify([
      {
        type: "tool-invocation",
        toolInvocation: {
          state: "call",
          toolCallId: "call_running",
          toolName: "web_search",
          args: { query: "Cloudflare R2 limits" },
          rawInput: { token: "PRIVATE_RAW_INPUT_SENTINEL" },
        },
      },
      {
        type: "tool-invocation",
        toolInvocation: {
          state: "result",
          toolCallId: "call_add",
          toolName: "add_issue_attachments",
          args: {
            assetIds: ["asset_1"],
            expectedRevision: 3,
            issueId: "issue_1",
          },
          result: {
            actionId: "action_add",
            operation: "added",
            issueId: "issue_1",
            issueNumber: 7,
            revision: 4,
            fileIds: ["file_1"],
          },
        },
      },
      {
        type: "tool-invocation",
        toolInvocation: {
          state: "result",
          toolCallId: "call_remove",
          toolName: "remove_issue_attachments",
          args: {
            expectedRevision: 4,
            fileIds: ["file_1"],
            issueId: "issue_1",
          },
          result: {
            actionId: "action_remove",
            operation: "removed",
            issueId: "issue_1",
            issueNumber: 7,
            revision: 5,
            fileIds: ["file_1"],
          },
        },
      },
      {
        type: "tool-invocation",
        toolInvocation: {
          state: "approval-responded",
          toolCallId: "call_denied",
          toolName: "update_issue",
          args: {
            expectedRevision: 5,
            issueId: "issue_1",
            title: "Declined title",
          },
          approval: { id: "approval_1", approved: false },
        },
      },
      {
        type: "tool-invocation",
        toolInvocation: {
          state: "output-error",
          toolCallId: "call_failed",
          toolName: "get_issue",
          args: { lookup: "id", id: "issue_1" },
          errorText:
            "Bearer PRIVATE_ERROR_TOKEN at https://private.invalid/error",
        },
      },
      {
        type: "source-url",
        sourceId: "source_1",
        title: "Public source",
        url: "https://example.com/docs?id=123#fragment",
      },
      {
        type: "source-url",
        sourceId: "source_signed",
        title: "Signed source",
        url: "https://storage.example.com/object?sv=2026-01-01&sp=r&sig=PRIVATE_RELOAD_SIGNATURE",
      },
    ])
  )

describe("App registry to Agent Memory boundary", () => {
  it("hides registry-only archives and denies cross-tenant history with separate LibSQL stores", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-memory-boundary-"))
    const applicationPath = join(directory, "application.db")
    const agentPath = join(directory, "agent.db")
    const application = new DatabaseSync(applicationPath)
    application.exec(`
      create table agent_thread_registry (
        id text primary key,
        organization_id text not null,
        owner_user_id text not null,
        status text not null
      );
      insert into agent_thread_registry values
        ('thread_boundary', 'org_a', 'user_a', 'active');
    `)
    let composition = createAgentRuntimeComposition({
      ...process.env,
      MASTRA_STORAGE_URL: `file:${agentPath}`,
      NODE_ENV: "test",
    })
    let memory = await composition.productAgent.getMemory()
    if (!(memory instanceof Memory)) throw new Error("Memory unavailable")
    const resourceId = "resource_org_a_user_a"
    const threadId = "thread_boundary"
    const now = new Date()
    const tickets = new Map<
      string,
      { organizationId: string; userId: string; threadId: string }
    >()
    const listRegistry = (organizationId: string, userId: string) =>
      application
        .prepare(
          `select id from agent_thread_registry
           where organization_id = ? and owner_user_id = ? and status = 'active'`
        )
        .all(organizationId, userId)
        .flatMap((row) => (typeof row.id === "string" ? [row.id] : []))
    const issueTicket = (
      organizationId: string,
      userId: string,
      requestedThreadId: string
    ) => {
      if (!listRegistry(organizationId, userId).includes(requestedThreadId)) {
        return null
      }
      const ticket = `ticket_${crypto.randomUUID().replaceAll("-", "")}`
      tickets.set(ticket, {
        organizationId,
        userId,
        threadId: requestedThreadId,
      })
      return ticket
    }
    const consumeConnectionTicket: AgentControlPlanePort["consumeConnectionTicket"] =
      async ({ ticket, threadId: requestedThreadId }) => {
        const bound = tickets.get(ticket)
        tickets.delete(ticket)
        if (
          !bound ||
          bound.threadId !== requestedThreadId ||
          !listRegistry(bound.organizationId, bound.userId).includes(
            requestedThreadId
          )
        ) {
          throw new Error("Agent capability is invalid")
        }
        return {
          grant: `grant_${crypto.randomUUID().replaceAll("-", "")}`,
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
          thread: { id: requestedThreadId, title: "Boundary thread" },
        }
      }
    const dependencies: Parameters<typeof handleMemoryHistory>[2] = {
      mastra: composition.mastra,
      createControlPlane: () => ({
        consumeConnectionTicket,
        settleMemoryCommit: () =>
          Promise.reject(new Error("Memory settlement unavailable")),
      }),
    }
    const environment: Parameters<typeof handleMemoryHistory>[1] = {
      AGENT_INTERNAL_API: {},
    }

    try {
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
            role: "user",
            createdAt: now,
            threadId,
            resourceId,
            content: {
              format: 2,
              parts: [{ type: "text", text: "Persisted boundary message" }],
            },
          },
        ],
      })

      const historyTicket = issueTicket("org_a", "user_a", threadId)
      if (!historyTicket) throw new Error("Ticket unavailable")
      const history = await handleMemoryHistory(
        new Request("https://agent.internal/memory/history", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            page: 0,
            perPage: 40,
            threadId,
            ticket: historyTicket,
          }),
        }),
        environment,
        dependencies
      )
      expect(history.status).toBe(200)
      expect(await history.json()).toMatchObject({
        messages: [{ id: "message_boundary" }],
        total: 1,
      })

      const listTicket = issueTicket("org_a", "user_a", threadId)
      if (!listTicket) throw new Error("Ticket unavailable")
      const listed = await handleMemoryThreads(
        new Request("https://agent.internal/memory/threads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            registryThreadIds: listRegistry("org_a", "user_a"),
            threadId,
            ticket: listTicket,
          }),
        }),
        environment,
        dependencies
      )
      expect(await listed.json()).toEqual([
        expect.objectContaining({
          id: threadId,
          title: "Persisted boundary thread",
        }),
      ])

      await suspendMemoryCommit(composition.mastra, {
        applicationRunId: "run_tool_history",
        desiredOutcome: "completed",
        messages: [
          {
            id: "message_tool_history",
            role: "assistant",
            createdAt: now,
            threadId,
            resourceId,
            content: {
              format: 2,
              parts: toolHistoryParts(),
            },
          },
        ],
        resourceId,
        threadId,
      })
      await reconcileMemoryCommit(
        composition.mastra,
        {
          settleMemoryCommit: (input) =>
            Promise.resolve({
              acknowledged: true,
              applicationRunId: input.applicationRunId,
            }),
        },
        {
          applicationRunId: "run_tool_history",
          desiredOutcome: "completed",
        }
      )
      const toolHistoryTicket = issueTicket("org_a", "user_a", threadId)
      if (!toolHistoryTicket) throw new Error("Ticket unavailable")
      const toolHistory = await handleMemoryHistory(
        new Request("https://agent.internal/memory/history", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            page: 0,
            perPage: 40,
            threadId,
            ticket: toolHistoryTicket,
          }),
        }),
        environment,
        dependencies
      )
      expect(toolHistory.status).toBe(200)
      const toolHistoryBody = await toolHistory.json()
      expect(toolHistoryBody).toMatchObject({
        messages: [
          { id: "message_boundary" },
          {
            id: "message_tool_history",
            parts: expect.arrayContaining([
              expect.objectContaining({
                type: "tool-web_search",
                state: "input-available",
              }),
              expect.objectContaining({
                type: "tool-add_issue_attachments",
                state: "output-available",
                output: expect.objectContaining({
                  operation: "added",
                  revision: 4,
                  fileIds: ["file_1"],
                }),
              }),
              expect.objectContaining({
                type: "tool-remove_issue_attachments",
                state: "output-available",
                output: expect.objectContaining({
                  operation: "removed",
                  revision: 5,
                  fileIds: ["file_1"],
                }),
              }),
              expect.objectContaining({
                type: "tool-update_issue",
                state: "approval-responded",
              }),
              expect.objectContaining({
                type: "tool-get_issue",
                state: "output-error",
                errorText: "Agent tool execution failed.",
              }),
              {
                type: "source-url",
                sourceId: "source_1",
                title: "Public source",
                url: "https://example.com/docs",
              },
              {
                type: "source-url",
                sourceId: "source_signed",
                title: "Signed source",
                url: "https://storage.example.com/object",
              },
            ]),
          },
        ],
      })
      expect(JSON.stringify(toolHistoryBody)).not.toContain(
        "PRIVATE_RAW_INPUT_SENTINEL"
      )
      expect(JSON.stringify(toolHistoryBody)).not.toContain(
        "PRIVATE_ERROR_TOKEN"
      )
      expect(JSON.stringify(toolHistoryBody)).not.toContain(
        "PRIVATE_RELOAD_SIGNATURE"
      )

      await suspendMemoryCommit(composition.mastra, {
        applicationRunId: "run_pending_memory",
        desiredOutcome: "completed",
        messages: [
          {
            id: "message_pending",
            role: "assistant",
            createdAt: now,
            threadId,
            resourceId,
            content: {
              format: 2,
              parts: [{ type: "text", text: "Pending response" }],
            },
          },
        ],
        resourceId,
        threadId,
      })
      const pendingHistoryTicket = issueTicket("org_a", "user_a", threadId)
      if (!pendingHistoryTicket) throw new Error("Ticket unavailable")
      const pendingHistory = await handleMemoryHistory(
        new Request("https://agent.internal/memory/history", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            page: 0,
            perPage: 40,
            threadId,
            ticket: pendingHistoryTicket,
          }),
        }),
        environment,
        dependencies
      )
      expect(pendingHistory.status).toBe(503)
      const pendingListTicket = issueTicket("org_a", "user_a", threadId)
      if (!pendingListTicket) throw new Error("Ticket unavailable")
      const pendingList = await handleMemoryThreads(
        new Request("https://agent.internal/memory/threads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            registryThreadIds: [threadId],
            threadId,
            ticket: pendingListTicket,
          }),
        }),
        environment,
        dependencies
      )
      expect(pendingList.status).toBe(503)

      const failedRetryTicket = issueTicket("org_a", "user_a", threadId)
      if (!failedRetryTicket) throw new Error("Ticket unavailable")
      expect(
        await handleMemoryHistory(
          new Request("https://agent.internal/memory/history", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              page: 0,
              perPage: 40,
              threadId,
              ticket: failedRetryTicket,
            }),
          }),
          environment,
          dependencies
        )
      ).toMatchObject({ status: 503 })

      await composition.storage.close()
      composition = createAgentRuntimeComposition({
        ...process.env,
        MASTRA_STORAGE_URL: `file:${agentPath}`,
        NODE_ENV: "test",
      })
      memory = await composition.productAgent.getMemory()
      if (!(memory instanceof Memory)) throw new Error("Memory unavailable")
      dependencies.mastra = composition.mastra
      await reconcilePendingMemoryCommits(composition.mastra, {
        settleMemoryCommit: (input) =>
          Promise.resolve({
            acknowledged: true,
            applicationRunId: input.applicationRunId,
          }),
      })
      const recoveredHistoryTicket = issueTicket("org_a", "user_a", threadId)
      if (!recoveredHistoryTicket) throw new Error("Ticket unavailable")
      const recoveredHistory = await handleMemoryHistory(
        new Request("https://agent.internal/memory/history", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            page: 0,
            perPage: 40,
            threadId,
            ticket: recoveredHistoryTicket,
          }),
        }),
        environment,
        dependencies
      )
      expect(recoveredHistory.status).toBe(200)
      expect(JSON.stringify(await recoveredHistory.json())).toContain(
        "Pending response"
      )
      const recoveredListTicket = issueTicket("org_a", "user_a", threadId)
      if (!recoveredListTicket) throw new Error("Ticket unavailable")
      expect(
        await handleMemoryThreads(
          new Request("https://agent.internal/memory/threads", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              registryThreadIds: [threadId],
              threadId,
              ticket: recoveredListTicket,
            }),
          }),
          environment,
          dependencies
        )
      ).toMatchObject({ status: 200 })

      await suspendMemoryCommit(composition.mastra, {
        applicationRunId: "run_terminal_race",
        desiredOutcome: "completed",
        messages: [
          {
            id: "message_terminal_race",
            role: "assistant",
            createdAt: now,
            threadId,
            resourceId,
            content: {
              format: 2,
              parts: [{ type: "text", text: "Canonical response" }],
            },
          },
        ],
        resourceId,
        threadId,
      })
      await reconcileMemoryCommit(
        composition.mastra,
        {
          settleMemoryCommit: (input) =>
            Promise.resolve({
              acknowledged: true,
              applicationRunId: input.applicationRunId,
            }),
        },
        {
          applicationRunId: "run_terminal_race",
          desiredOutcome: "completed",
        }
      )
      const discardHistoryTicket = issueTicket("org_a", "user_a", threadId)
      if (!discardHistoryTicket) throw new Error("Ticket unavailable")
      const discardHistory = await handleMemoryHistory(
        new Request("https://agent.internal/memory/history", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            page: 0,
            perPage: 40,
            threadId,
            ticket: discardHistoryTicket,
          }),
        }),
        environment,
        dependencies
      )
      expect(discardHistory.status).toBe(200)
      expect(JSON.stringify(await discardHistory.json())).toContain(
        "Canonical response"
      )
      const discardListTicket = issueTicket("org_a", "user_a", threadId)
      if (!discardListTicket) throw new Error("Ticket unavailable")
      expect(
        await handleMemoryThreads(
          new Request("https://agent.internal/memory/threads", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              registryThreadIds: [threadId],
              threadId,
              ticket: discardListTicket,
            }),
          }),
          environment,
          dependencies
        )
      ).toMatchObject({ status: 200 })

      expect(issueTicket("org_b", "user_a", threadId)).toBeNull()
      application
        .prepare(
          "update agent_thread_registry set status = 'archived' where id = ?"
        )
        .run(threadId)
      expect(listRegistry("org_a", "user_a")).toEqual([])
      expect(issueTicket("org_a", "user_a", threadId)).toBeNull()
      expect(
        await memory.getThreadById({ resourceId, threadId })
      ).toMatchObject({ id: threadId })
    } finally {
      application.close()
      await composition.storage.close()
      await rm(directory, { force: true, recursive: true })
    }
  })
})
