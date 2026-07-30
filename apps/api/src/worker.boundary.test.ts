import { beforeEach, describe, expect, it, vi } from "vitest"

const boundarySpies = vi.hoisted(() => ({
  agentActionSweep: vi.fn<() => void>(),
  agentAssetLifecycle: vi.fn<() => void>(),
  fileCleanup: vi.fn<() => void>(),
  fileRuntime: vi.fn<() => void>(),
  internalApi: vi.fn<() => void>(),
  invitationJobs: vi.fn<() => void>(),
  otlpExporter: vi.fn<(options: unknown) => void>(),
  organizationDeletion: vi.fn<() => void>(),
  profileImageCleanup: vi.fn<() => void>(),
  resolveConfig: vi.fn<(environment: unknown) => void>(),
  withNextSpan: vi.fn<(attributes: unknown) => void>(),
}))

vi.mock("cloudflare:workers", () => ({
  WorkerEntrypoint: class {
    env: unknown

    constructor(_context: unknown, env: unknown) {
      this.env = env
    }
  },
}))

vi.mock("@inference-net/otel-cf-workers", () => ({
  BatchTraceSpanProcessor: class {
    forceFlush(): Promise<void> {
      return Promise.resolve()
    }
  },
  getLogger: () => ({ error: vi.fn<() => void>() }),
  instrument: (
    handler: {
      fetch?: (...arguments_: unknown[]) => unknown
      scheduled?: (...arguments_: unknown[]) => unknown
    },
    resolveConfig: (environment: unknown) => unknown
  ) => ({
    ...handler,
    fetch: handler.fetch
      ? (...arguments_: unknown[]) => {
          boundarySpies.resolveConfig(arguments_[1])
          resolveConfig(arguments_[1])
          return handler.fetch?.(...arguments_)
        }
      : undefined,
    scheduled: handler.scheduled
      ? (...arguments_: unknown[]) => {
          boundarySpies.resolveConfig(arguments_[1])
          resolveConfig(arguments_[1])
          return handler.scheduled?.(...arguments_)
        }
      : undefined,
  }),
  OTLPExporter: class {
    readonly options: unknown

    constructor(options: unknown) {
      this.options = options
      boundarySpies.otlpExporter(options)
    }
  },
  OTLPTransport: vi.fn<(options: unknown) => void>(),
  withNextSpan: boundarySpies.withNextSpan,
}))

vi.mock("@enterprise-agentic-saas/db", () => ({ db: {} }))

vi.mock("./app", async () => {
  const { Elysia } = await import("elysia")
  return { createApp: () => new Elysia() }
})
vi.mock("./modules/agent/internal-api", async () => {
  const { Elysia } = await import("elysia")
  return {
    createAgentInternalApp: () =>
      new Elysia().all("*", () => {
        boundarySpies.internalApi()
        return new Response(null, { status: 204 })
      }),
  }
})
vi.mock("./platform/plugins/auth", async () => {
  const { Elysia } = await import("elysia")
  return { authPlugin: new Elysia() }
})

vi.mock("./modules/agent/actions/repository", () => ({
  sweepAgentActions: boundarySpies.agentActionSweep,
}))
vi.mock("./modules/files/agent-assets-cleanup", () => ({
  processAgentAssetLifecycle: boundarySpies.agentAssetLifecycle,
}))
vi.mock("./modules/files/cleanup-jobs", () => ({
  processFileCleanupJobs: boundarySpies.fileCleanup,
}))
vi.mock("./modules/files/worker-runtime", () => ({
  configureFileStorageRuntimeFromWorkerEnvironment: boundarySpies.fileRuntime,
}))
vi.mock("./modules/organizations/deletion-jobs", () => ({
  processOrganizationDeletionJobs: boundarySpies.organizationDeletion,
}))
vi.mock("./modules/organizations/invitation-email-jobs", () => ({
  processInvitationEmailJobs: boundarySpies.invitationJobs,
}))
vi.mock("./modules/profile-images/cleanup-jobs", () => ({
  processProfileImageCleanupJobs: boundarySpies.profileImageCleanup,
}))

import apiWorker, { AgentInternalApi, resolveWorkerOtelConfig } from "./worker"

describe("Worker maintenance executable boundaries", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns 503 from the named Agent entrypoint before internal runtime setup", async () => {
    const entrypointContext: ConstructorParameters<typeof AgentInternalApi>[0] =
      Object.create(null)
    const maintenanceEnvironment: ConstructorParameters<
      typeof AgentInternalApi
    >[1] = Object.assign(Object.create(null), {
      AGENT_MAINTENANCE_MODE: "1",
    })
    const entrypoint = new AgentInternalApi(
      entrypointContext,
      maintenanceEnvironment
    )

    const response = await entrypoint.fetch(
      new Request("https://internal.example.test/agent")
    )

    expect(response.status).toBe(503)
    expect(await response.text()).toBe("Agent maintenance in progress")
    expect(boundarySpies.fileRuntime).not.toHaveBeenCalled()
    expect(boundarySpies.internalApi).not.toHaveBeenCalled()
  })

  it("does not start or enqueue scheduled work during maintenance", () => {
    const waitUntil = vi.fn<(promise: Promise<unknown>) => void>()
    const maintenanceEnvironment: ConstructorParameters<
      typeof AgentInternalApi
    >[1] = Object.assign(Object.create(null), {
      AGENT_MAINTENANCE_MODE: "1",
    })

    apiWorker.scheduled(
      { cron: "* * * * *", scheduledTime: 0 },
      maintenanceEnvironment,
      { waitUntil }
    )

    expect(waitUntil).not.toHaveBeenCalled()
    expect(boundarySpies.agentActionSweep).not.toHaveBeenCalled()
    expect(boundarySpies.agentAssetLifecycle).not.toHaveBeenCalled()
    expect(boundarySpies.fileCleanup).not.toHaveBeenCalled()
    expect(boundarySpies.invitationJobs).not.toHaveBeenCalled()
    expect(boundarySpies.organizationDeletion).not.toHaveBeenCalled()
    expect(boundarySpies.profileImageCleanup).not.toHaveBeenCalled()
  })

  it("executes local telemetry identity resolution at default, named, and scheduled boundaries", async () => {
    const localEnvironment = Object.assign(Object.create(null), {
      AGENT_MAINTENANCE_MODE: "1",
      DEV_SESSION_ID: "session-1",
      DEV_WORKTREE_ID: "feature-auth",
      NODE_ENV: "development",
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
    })
    const context = {
      waitUntil: vi.fn<(promise: Promise<unknown>) => void>(),
    }

    await apiWorker.fetch?.(
      new Request("https://api.example.test/agent"),
      localEnvironment,
      context
    )
    const entrypoint = new AgentInternalApi(
      Object.create(null),
      localEnvironment
    )
    await entrypoint.fetch(new Request("https://internal.example.test/agent"))
    apiWorker.scheduled?.(
      { cron: "* * * * *", scheduledTime: 0 },
      localEnvironment,
      context
    )

    expect(boundarySpies.resolveConfig).toHaveBeenCalledTimes(3)
    expect(boundarySpies.withNextSpan).toHaveBeenCalledTimes(3)
    expect(boundarySpies.withNextSpan).toHaveBeenCalledWith({
      "dev.session.id": "session-1",
      "dev.worktree.id": "feature-auth",
      "service.name": "enterprise-agentic-saas-api",
    })

    const config = resolveWorkerOtelConfig(localEnvironment)
    expect(config).toMatchObject({
      logs: {
        batching: { strategy: "immediate" },
        instrumentation: { instrumentConsole: false },
      },
      service: { name: "enterprise-agentic-saas-api" },
      trace: {
        batching: { strategy: "immediate" },
        spanProcessors: [expect.anything()],
      },
    })
    expect(boundarySpies.otlpExporter).toHaveBeenCalledWith({
      url: "http://127.0.0.1:4318/v1/traces",
    })
  })

  it("keeps API exporters disabled for production, remote, or incomplete identities", () => {
    for (const environment of [
      {
        DEV_SESSION_ID: "session-1",
        DEV_WORKTREE_ID: "feature-auth",
        NODE_ENV: "production",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
      },
      {
        DEV_SESSION_ID: "session-1",
        DEV_WORKTREE_ID: "feature-auth",
        NODE_ENV: "development",
        OTEL_EXPORTER_OTLP_ENDPOINT: "https://remote.example.test",
      },
      {
        DEV_SESSION_ID: "",
        DEV_WORKTREE_ID: "feature-auth",
        NODE_ENV: "development",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
      },
    ]) {
      expect(resolveWorkerOtelConfig(environment)).toEqual({
        service: { name: "enterprise-agentic-saas-api" },
      })
    }
    expect(boundarySpies.withNextSpan).not.toHaveBeenCalled()
  })
})
