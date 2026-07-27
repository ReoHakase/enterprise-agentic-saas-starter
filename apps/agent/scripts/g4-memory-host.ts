import {
  createAgentInternalGateway,
  toAgentControlFailure,
} from "../src/mastra/adapters/control-plane/client"
import type { PortableAgentRuntimeEnv } from "../src/mastra/composition/environment"
import { createScriptedAgentRuntimeComposition } from "../src/mastra/e2e/scripted-runtime-composition"
import { handleAgentRuntimeRequest } from "../src/mastra/runtime/run-agent"

const requireEnvironment = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

const storageUrl = requireEnvironment("AGENT_G4_STORAGE_URL")
const internalApiUrl = requireEnvironment("AGENT_G4_INTERNAL_API_URL")
const environment: PortableAgentRuntimeEnv = {
  AGENT_INTERNAL_API: {
    fetch(input, init) {
      if (!(input instanceof Request) || init !== undefined) {
        throw new Error("G4 Service Binding requires a Request")
      }
      const request = input
      const target = new URL(request.url)
      return fetch(
        new Request(
          `${internalApiUrl}${target.pathname}${target.search}`,
          request
        )
      )
    },
  },
  AGENT_RUNS_ENABLED: "1",
  AGENT_VISION_ENABLED: "0",
  AGENT_WRITES_ENABLED: "1",
  MASTRA_STORAGE_URL: storageUrl,
  NODE_ENV: "test",
  SENTRY_ENVIRONMENT: "test",
}

let composition = createScriptedAgentRuntimeComposition(environment)
const pending = new Set<Promise<unknown>>()

const runtimeDependencies = () => ({
  approvedIssueActionExecutionRegistry:
    composition.approvedIssueActionExecutionRegistry,
  captureFailure: () => undefined,
  createControlPlane: createAgentInternalGateway,
  executionRegistry: composition.executionRegistry,
  mastra: composition.mastra,
  requireModelCredential: false,
  threadTitleAgent: composition.threadTitleAgent,
  toControlFailure: toAgentControlFailure,
})

const inspectMemory = async (threadId: string): Promise<Response> => {
  const memory = await composition.mastra
    .getAgentById("product-agent")
    .getMemory()
  if (!memory) throw new Error("Agent Memory unavailable")
  const thread = await memory.getThreadById({ threadId })
  if (!thread) return new Response("Not found", { status: 404 })
  const recalled = await memory.recall({
    resourceId: thread.resourceId,
    threadId,
    page: 0,
    perPage: 40,
  })
  return Response.json({
    messageIds: recalled.messages.map(({ id }) => id),
    threadId: thread?.id ?? null,
  })
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url)
    if (request.method === "POST" && url.pathname === "/__g4/drain") {
      await Promise.all(pending)
      return Response.json({ drained: true })
    }
    if (request.method === "POST" && url.pathname === "/__g4/reopen") {
      await Promise.all(pending)
      await composition.storage.close()
      composition = createScriptedAgentRuntimeComposition(environment)
      return Response.json({ reopened: true })
    }
    if (request.method === "GET" && url.pathname === "/__g4/inspect") {
      return inspectMemory(url.searchParams.get("threadId") ?? "")
    }
    const runtimeRequest = new Request(
      `https://agent.internal${url.pathname}${url.search}`,
      request
    )
    return handleAgentRuntimeRequest(
      runtimeRequest,
      environment,
      {
        waitUntil: (promise) => {
          pending.add(promise)
          void promise.finally(() => pending.delete(promise))
        },
      },
      runtimeDependencies()
    )
  },
})

process.stdout.write(`G4_HOST_URL=${server.url.origin}\n`)
