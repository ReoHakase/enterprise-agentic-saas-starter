import { beforeEach, describe, expect, it, vi } from "vitest"

const boundarySpies = vi.hoisted(() => ({
  agentActionSweep: vi.fn<() => void>(),
  agentAssetLifecycle: vi.fn<() => void>(),
  fileCleanup: vi.fn<() => void>(),
  fileRuntime: vi.fn<() => void>(),
  internalApi: vi.fn<() => void>(),
  invitationJobs: vi.fn<() => void>(),
  organizationDeletion: vi.fn<() => void>(),
  profileImageCleanup: vi.fn<() => void>(),
}))

vi.mock("cloudflare:workers", () => ({
  WorkerEntrypoint: class {
    env: unknown

    constructor(_context: unknown, env: unknown) {
      this.env = env
    }
  },
}))

vi.mock("@sentry/cloudflare", () => ({
  captureException: vi.fn<() => void>(),
  getActiveSpan: vi.fn<() => void>(),
  getIsolationScope: vi.fn<() => void>(),
  logger: {},
  setHttpStatus: vi.fn<() => void>(),
  startSpan: vi.fn<() => void>(),
  updateSpanName: vi.fn<() => void>(),
  withScope: vi.fn<() => void>(),
  withSentry: (_options: unknown, handler: unknown) => handler,
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

import apiWorker, { AgentInternalApi } from "./worker"

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
})
