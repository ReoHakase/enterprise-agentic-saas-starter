import { z } from "zod"

import { createProductAgentMemory } from "../agents/product-agent"
import { createAgentStorage } from "../storage"

export const fixtureIdentitySchema = z
  .object({
    issueId: z.string().min(1),
    memoryResourceId: z.string().min(1),
    organizationId: z.string().min(1),
    sessionId: z.string().min(1),
    sentinel: z.string().min(1),
    sentinelThreadId: z.string().min(1),
    userId: z.string().min(1),
  })
  .passthrough()

export type AgentEvalFixtureIdentity = z.infer<typeof fixtureIdentitySchema>

const memoryHistorySchema = z
  .object({
    messages: z.array(
      z.object({
        role: z.string(),
        parts: z.array(z.unknown()),
      })
    ),
    total: z.number().int().nonnegative(),
  })
  .passthrough()

export const seedAndVerifySentinelMemory = async (input: {
  agentDatabaseOrigin: string
  agentStorageAuthToken: string
  identity: AgentEvalFixtureIdentity
  namespace: string
}) => {
  const storage = createAgentStorage(
    {
      MASTRA_STORAGE_AUTH_TOKEN: input.agentStorageAuthToken,
      MASTRA_STORAGE_URL: input.agentDatabaseOrigin,
      NODE_ENV: "test",
    },
    `agent-eval-sentinel-${input.namespace}`
  )
  const memory = createProductAgentMemory(storage)
  const now = new Date()
  const preflightThreadId = `${input.identity.sentinelThreadId}_preflight`
  try {
    await storage.init()
    await memory.saveThread({
      thread: {
        id: input.identity.sentinelThreadId,
        resourceId: input.identity.memoryResourceId,
        createdAt: now,
        updatedAt: now,
        title: "Private isolation sentinel",
        metadata: {},
      },
    })
    await memory.saveMessages({
      messages: [
        {
          id: `message_${input.identity.sentinelThreadId}`,
          role: "user",
          createdAt: now,
          threadId: input.identity.sentinelThreadId,
          resourceId: input.identity.memoryResourceId,
          content: {
            format: 2,
            parts: [{ type: "text", text: input.identity.sentinel }],
          },
        },
      ],
    })
    await memory.saveThread({
      thread: {
        id: preflightThreadId,
        resourceId: input.identity.memoryResourceId,
        createdAt: now,
        updatedAt: now,
        title: "Isolation preflight",
        metadata: {},
      },
    })
    const sentinelRecall = await memory.recall({
      page: 0,
      perPage: false,
      resourceId: input.identity.memoryResourceId,
      threadId: input.identity.sentinelThreadId,
    })
    const preflightRecall = await memory.recall({
      page: 0,
      perPage: false,
      resourceId: input.identity.memoryResourceId,
      threadId: preflightThreadId,
    })
    if (
      !JSON.stringify(sentinelRecall.messages).includes(
        input.identity.sentinel
      ) ||
      JSON.stringify(preflightRecall.messages).includes(input.identity.sentinel)
    ) {
      throw new Error("Agent eval sentinel memory isolation preflight failed")
    }
  } finally {
    await storage.close().catch(() => undefined)
  }
}

export const verifySentinelThroughPublicHistory = async (input: {
  apiOrigin: string
  identity: AgentEvalFixtureIdentity
}) => {
  const headers = {
    "content-type": "application/json",
    origin: input.apiOrigin,
    "x-test-active-organization-id": input.identity.organizationId,
    "x-test-session-created-at": new Date().toISOString(),
    "x-test-session-id": input.identity.sessionId,
    "x-test-user-id": input.identity.userId,
  }
  const sentinelResponse = await fetch(
    `${input.apiOrigin}/agent/threads/${input.identity.sentinelThreadId}/messages?page=0&perPage=40`,
    { headers }
  )
  if (!sentinelResponse.ok) {
    await sentinelResponse.body?.cancel()
    throw new Error("Agent eval sentinel public history failed")
  }
  const sentinelHistory = memoryHistorySchema.parse(
    await sentinelResponse.json()
  )
  if (
    sentinelHistory.total !== 1 ||
    sentinelHistory.messages[0]?.role !== "user" ||
    !JSON.stringify(sentinelHistory.messages[0]?.parts).includes(
      input.identity.sentinel
    )
  ) {
    throw new Error("Agent eval sentinel public history mismatched")
  }
  const targetResponse = await fetch(`${input.apiOrigin}/agent/threads`, {
    body: "{}",
    headers,
    method: "POST",
  })
  if (!targetResponse.ok) {
    await targetResponse.body?.cancel()
    throw new Error("Agent eval target thread creation failed")
  }
  const target = z
    .object({ id: z.string().min(1) })
    .passthrough()
    .parse(await targetResponse.json())
  if (target.id === input.identity.sentinelThreadId) {
    throw new Error("Agent eval target thread was not isolated")
  }
  const targetHistoryResponse = await fetch(
    `${input.apiOrigin}/agent/threads/${target.id}/messages?page=0&perPage=40`,
    { headers }
  )
  if (!targetHistoryResponse.ok) {
    await targetHistoryResponse.body?.cancel()
    throw new Error("Agent eval target public history failed")
  }
  const targetHistory = memoryHistorySchema.parse(
    await targetHistoryResponse.json()
  )
  if (
    targetHistory.total !== 0 ||
    JSON.stringify(targetHistory.messages).includes(input.identity.sentinel)
  ) {
    throw new Error("Agent eval target public history leaked sentinel memory")
  }
}
