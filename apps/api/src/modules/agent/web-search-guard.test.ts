import * as schema from "@enterprise-agentic-saas/db/schema"
import { describe, expect, it } from "vitest"

import { createFixture } from "./agent.test-support"
import { createAgentInternalApi } from "./internal-api"
import {
  createAgentThreadForSession,
  issueAgentConnectionTicket,
} from "./threads/repository"
import { renameAgentThreadForRun } from "./threads/search-repository"

const createGuardFixture = async ({
  currentMessageText = [
    "The internal codename BlueHorizon is not public.",
    "Public-only Web query: current approaches to prioritizing software defects",
  ].join("\n"),
}: {
  currentMessageText?: string
} = {}) => {
  const { db } = await createFixture()
  const thread = await createAgentThreadForSession(db, {
    sessionId: "agent-session-a",
    userId: "agent-user-a",
    title: "Private roadmap",
  })
  const now = new Date()
  await db.insert(schema.agentMessages).values([
    {
      id: "historical-private-message",
      organizationId: "agent-org-a",
      threadId: thread.id,
      clientMessageId: null,
      role: "assistant",
      content: {
        parts: [
          {
            type: "text",
            text: "Project Zephyr rollout details are private.",
          },
        ],
      },
      createdAt: new Date(now.getTime() - 1_000),
    },
    {
      id: "current-search-message",
      organizationId: "agent-org-a",
      threadId: thread.id,
      clientMessageId: "message-web-search-guard",
      role: "user",
      content: {
        parts: [
          {
            type: "text",
            text: currentMessageText,
          },
          {
            type: "data-context-reference",
            data: {
              kind: "current_page",
              path: "/organization/agent-org-a/issues",
              label: "Secret acquisition dashboard",
            },
          },
        ],
      },
      createdAt: now,
    },
  ])
  const internal = createAgentInternalApi(db)
  const ticket = await issueAgentConnectionTicket(db, {
    sessionId: "agent-session-a",
    userId: "agent-user-a",
    threadId: thread.id,
  })
  const connection = await internal.consumeConnectionTicket({
    ticket: ticket.ticket,
    threadId: thread.id,
  })
  const run = await internal.startRun({
    grant: connection.grant,
    clientMessageId: "message-web-search-guard",
  })
  return {
    db,
    guard: internal.guardWebSearch,
    grant: run.grant,
    now,
    threadId: thread.id,
  }
}

describe("Agent Web search server guard", () => {
  it("rejects private tenant strings and ambiguous history", async () => {
    const { guard, grant } = await createGuardFixture()

    await expect(
      guard({
        grant,
        query: "current approaches to prioritizing software defects",
      })
    ).resolves.toEqual({
      query: "current approaches to prioritizing software defects",
    })
    for (const query of [
      "Agent Org A company news",
      "Agent User B software work",
      "outsider@example.com public profile",
      "123 Main Street public records",
      "Fix API boundary release status",
      "Secret acquisition dashboard news",
      "Private roadmap milestones",
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await expect(guard({ grant, query })).rejects.toMatchObject({
        code: "validation_error",
        publicMessage: "Web search query is not public",
      })
    }
    await expect(
      guard({ grant, query: "Project Zephyr market news" })
    ).rejects.toMatchObject({
      code: "validation_error",
      publicMessage: "Web search query requires a public-only restatement",
    })
    await expect(
      guard({ grant, query: "BlueHorizon product news" })
    ).rejects.toMatchObject({
      code: "validation_error",
      publicMessage: "Web search query requires a public-only restatement",
    })
  })

  it("rejects hidden Unicode control and format characters", async () => {
    const { guard, grant } = await createGuardFixture()

    for (const query of [
      "outsider@\u200Bexample.com public profile",
      "api_key=s\u200Bk-test-secret-value",
      "organization_id: org_\u2066privatevalue\u2069",
      "Cloudflare R2\u0000 current limits",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- each rejected query consumes the same bounded fixture grant.
      await expect(guard({ grant, query })).rejects.toMatchObject({
        code: "validation_error",
        publicMessage: "Web search query is not public",
      })
    }
  })

  it("requires one user-authored public-only restatement in the current message", async () => {
    const { guard, grant } = await createGuardFixture({
      currentMessageText:
        "Research current approaches to prioritizing software defects",
    })

    await expect(
      guard({
        grant,
        query: "current approaches to prioritizing software defects",
      })
    ).rejects.toMatchObject({
      code: "validation_error",
      publicMessage: "Web search query requires a public-only restatement",
    })
  })

  it("accepts the Japanese public-only restatement and returns its exact query", async () => {
    const { guard, grant } = await createGuardFixture({
      currentMessageText: "公開情報だけのWeb検索：Cloudflare R2 current limits",
    })

    await expect(
      guard({
        grant,
        query: "cloudflare   r2 current limits",
      })
    ).resolves.toEqual({
      query: "Cloudflare R2 current limits",
    })
  })

  it("does not let the current run's automatic title poison its authorized query", async () => {
    const { db, grant, guard } = await createGuardFixture()
    await renameAgentThreadForRun(db, {
      grant,
      now: new Date(Date.now() + 1_000),
      title: "Current approaches to prioritizing software defects",
    })

    await expect(
      guard({
        grant,
        query: "current approaches to prioritizing software defects",
      })
    ).resolves.toEqual({
      query: "current approaches to prioritizing software defects",
    })
  })

  it("rejects instead of partially inspecting oversized private context", async () => {
    const { db, guard, grant, now } = await createGuardFixture()
    await db.insert(schema.issues).values(
      Array.from({ length: 200 }, (_, index) => ({
        id: `web-search-boundary-issue-${index}`,
        organizationId: "agent-org-a",
        number: index + 2,
        title: `Bounded private issue ${index}`,
        description: "Private issue context",
        status: "open" as const,
        priority: "no_priority" as const,
        creatorId: "agent-user-a",
        labels: [],
        createdAt: now,
        updatedAt: now,
      }))
    )

    await expect(
      guard({ grant, query: "Cloudflare R2 current limits" })
    ).rejects.toMatchObject({
      code: "validation_error",
      publicMessage: "Web search private context is too large",
    })
  })

  it("rejects when the tenant identity set exceeds its inspection bound", async () => {
    const { db, guard, grant, now } = await createGuardFixture()
    const users = Array.from({ length: 499 }, (_, index) => ({
      id: `web-search-boundary-user-${index}`,
      name: `Boundary User ${index}`,
      email: `boundary-user-${index}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    }))
    await db.insert(schema.user).values(users)
    await db.insert(schema.member).values(
      users.map(({ id }, index) => ({
        id: `web-search-boundary-member-${index}`,
        organizationId: "agent-org-a",
        userId: id,
        role: "member",
        createdAt: now,
      }))
    )

    await expect(
      guard({ grant, query: "Cloudflare R2 current limits" })
    ).rejects.toMatchObject({
      code: "validation_error",
      publicMessage: "Web search private context is too large",
    })
  })

  it("rejects when the thread message set exceeds its inspection bound", async () => {
    const { db, guard, grant, now, threadId } = await createGuardFixture()
    await db.insert(schema.agentMessages).values(
      Array.from({ length: 199 }, (_, index) => ({
        id: `web-search-boundary-message-${index}`,
        organizationId: "agent-org-a",
        threadId,
        clientMessageId: null,
        role: "assistant" as const,
        content: {
          parts: [{ type: "text", text: `Private history ${index}` }],
        },
        createdAt: new Date(now.getTime() - index - 2_000),
      }))
    )

    await expect(
      guard({ grant, query: "Cloudflare R2 current limits" })
    ).rejects.toMatchObject({
      code: "validation_error",
      publicMessage: "Web search private context is too large",
    })
  })

  it("rejects when private message text exceeds its inspection bound", async () => {
    const { db, guard, grant, now, threadId } = await createGuardFixture()
    await db.insert(schema.agentMessages).values(
      Array.from({ length: 9 }, (_, index) => ({
        id: `web-search-boundary-text-${index}`,
        organizationId: "agent-org-a",
        threadId,
        clientMessageId: null,
        role: "assistant" as const,
        content: {
          parts: [{ type: "text", text: "x".repeat(125_000) }],
        },
        createdAt: new Date(now.getTime() - index - 2_000),
      }))
    )

    await expect(
      guard({ grant, query: "Cloudflare R2 current limits" })
    ).rejects.toMatchObject({
      code: "validation_error",
      publicMessage: "Web search private context is too large",
    })
  })
})
