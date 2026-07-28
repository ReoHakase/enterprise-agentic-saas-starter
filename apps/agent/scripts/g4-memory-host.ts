import {
  createAgentInternalGateway,
  toAgentControlFailure,
} from "../src/mastra/adapters/control-plane/client"
import type { PortableAgentRuntimeEnv } from "../src/mastra/composition/environment"
import { createScriptedAgentRuntimeComposition } from "../src/mastra/e2e/scripted-runtime-composition"
import { ProductAgentExecutionRegistry } from "../src/mastra/runtime/request-context"
import { handleAgentRuntimeRequest } from "../src/mastra/runtime/run-agent"

const requireEnvironment = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

const storageUrl = requireEnvironment("AGENT_G4_STORAGE_URL")
const internalApiUrl = requireEnvironment("AGENT_G4_INTERNAL_API_URL")
const crashWindow = process.env.AGENT_G4_CRASH_WINDOW
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

const metrics = {
  cancelRunCalls: 0,
  finishRunCalls: 0,
  livenessRejections: 0,
  prepareCreateIssueCalls: 0,
  releaseCalls: 0,
}
class CountingExecutionRegistry extends ProductAgentExecutionRegistry {
  override register(
    input: Parameters<ProductAgentExecutionRegistry["register"]>[0]
  ) {
    const registration = super.register(input)
    return {
      ...registration,
      release: () => {
        metrics.releaseCalls += 1
        registration.release()
      },
    }
  }
}
const executionRegistry = new CountingExecutionRegistry()
const productModelPrompts: string[] = []
let releaseRevocationGate: () => void = () => undefined
const revocationGate = new Promise<void>((resolve) => {
  releaseRevocationGate = resolve
})
let markToolCommitObserved: () => void = () => undefined
const toolCommitObserved = new Promise<void>((resolve) => {
  markToolCommitObserved = resolve
})
let releaseToolCommit: () => void = () => undefined
const toolCommitGate = new Promise<void>((resolve) => {
  releaseToolCommit = resolve
})
let markCrashWindowReached: () => void = () => undefined
const crashWindowReached = new Promise<void>((resolve) => {
  markCrashWindowReached = resolve
})
const crashBarrier = new Promise<void>(() => undefined)
const createComposition = () => {
  const next = createScriptedAgentRuntimeComposition(environment, {
    executionRegistry,
    onMemoryCommitBeforeSave:
      crashWindow === "before-memory-save"
        ? async () => {
            markCrashWindowReached()
            await crashBarrier
          }
        : undefined,
    onMemoryCommitSave:
      crashWindow === "after-memory-save"
        ? async () => {
            markCrashWindowReached()
            await crashBarrier
          }
        : undefined,
    onProductModelCall: (prompt) => productModelPrompts.push(prompt),
    revocationGate,
  })
  return next
}
let composition = createComposition()
const pending = new Set<Promise<unknown>>()

const drainPending = async (): Promise<void> => {
  const current = [...pending]
  if (current.length === 0) return
  await Promise.all(current)
  await drainPending()
}

const trackedControlPlane: typeof createAgentInternalGateway = (binding) => {
  const gateway = createAgentInternalGateway(binding)
  return {
    ...gateway,
    cancelRun: (input) => {
      metrics.cancelRunCalls += 1
      return gateway.cancelRun(input)
    },
    finishRun: (input) => {
      metrics.finishRunCalls += 1
      return gateway.finishRun(input)
    },
    prepareCreateIssue: async (input) => {
      metrics.prepareCreateIssueCalls += 1
      const action = await gateway.prepareCreateIssue(input)
      if (input.issue.title === "G4_REVOKE_AFTER_TOOL") {
        markToolCommitObserved()
        await toolCommitGate
      }
      return action
    },
    readActiveOrganization: async (input) => {
      try {
        return await gateway.readActiveOrganization(input)
      } catch (cause) {
        metrics.livenessRejections += 1
        throw cause
      }
    },
    settleMemoryCommit: async (input) => {
      const settlement = await gateway.settleMemoryCommit(input)
      if (crashWindow === "after-run-settlement") {
        markCrashWindowReached()
        await crashBarrier
      }
      return settlement
    },
  }
}

const runtimeDependencies = () => ({
  captureFailure: () => undefined,
  createApprovalResumeRuntime: composition.createApprovalResumeRuntime,
  createControlPlane: trackedControlPlane,
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

const inspectRevocationMemory = async (threadId: string): Promise<Response> => {
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
    messages: recalled.messages.map(({ content, id, role }) => ({
      content,
      id,
      role,
    })),
    threadId: thread.id,
    title: thread.title,
  })
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url)
    if (request.method === "POST" && url.pathname === "/__g4/drain") {
      await drainPending()
      return Response.json({ drained: true })
    }
    if (request.method === "POST" && url.pathname === "/__g4/reopen") {
      await drainPending()
      await composition.storage.close()
      composition = createComposition()
      return Response.json({ reopened: true })
    }
    if (
      request.method === "POST" &&
      url.pathname === "/__g4/release-revocation"
    ) {
      releaseRevocationGate()
      return Response.json({ released: true })
    }
    if (request.method === "GET" && url.pathname === "/__g4/wait-tool-commit") {
      await toolCommitObserved
      return Response.json({ committed: true })
    }
    if (
      request.method === "POST" &&
      url.pathname === "/__g4/release-tool-commit"
    ) {
      releaseToolCommit()
      return Response.json({ released: true })
    }
    if (request.method === "GET" && url.pathname === "/__g4/metrics") {
      return Response.json(metrics)
    }
    if (request.method === "GET" && url.pathname === "/__g4/wait-crash") {
      await crashWindowReached
      return Response.json({ crashWindow })
    }
    if (request.method === "GET" && url.pathname === "/__g4/model-calls") {
      return Response.json({
        count: productModelPrompts.length,
        prompts: productModelPrompts,
      })
    }
    if (request.method === "GET" && url.pathname === "/__g4/inspect") {
      return inspectMemory(url.searchParams.get("threadId") ?? "")
    }
    if (
      request.method === "GET" &&
      url.pathname === "/__g4/inspect-revocation"
    ) {
      return inspectRevocationMemory(url.searchParams.get("threadId") ?? "")
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
