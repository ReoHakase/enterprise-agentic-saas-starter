import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"

import { Memory } from "@mastra/memory"
import { describe, expect, it } from "vitest"

import { createAgentRuntimeComposition } from "../composition/runtime-composition"
import { handleMemoryHistory, handleMemoryThreads } from "./memory-routes"
import type { AgentControlPlanePort } from "./ports"

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
    const composition = createAgentRuntimeComposition({
      ...process.env,
      MASTRA_STORAGE_URL: `file:${agentPath}`,
      NODE_ENV: "test",
    })
    const memory = await composition.productAgent.getMemory()
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
      createControlPlane: () => ({ consumeConnectionTicket }),
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
