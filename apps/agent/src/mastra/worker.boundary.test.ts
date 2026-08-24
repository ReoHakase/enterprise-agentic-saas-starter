import { describe, expect, it, vi } from "vitest"

const workerSpies = vi.hoisted(() => ({
  instrument: vi.fn<(handler: object, resolver: unknown) => object>(
    (handler) => handler
  ),
  withNextSpan: vi.fn<(attributes: unknown) => void>(),
}))

vi.mock("cloudflare:workers", () => ({
  WorkerEntrypoint: class {
    ctx: ExecutionContext
    env: unknown

    constructor(context: ExecutionContext, environment: unknown) {
      this.ctx = context
      this.env = environment
    }
  },
}))

vi.mock("@inference-net/otel-cf-workers", () => ({
  getLogger: () => ({
    debug: vi.fn<() => void>(),
    emit: vi.fn<() => void>(),
    error: vi.fn<() => void>(),
    info: vi.fn<() => void>(),
    setProperties: vi.fn<() => void>(),
    warn: vi.fn<() => void>(),
  }),
  instrument: workerSpies.instrument,
  OTLPTransport: vi.fn<(options: unknown) => void>(),
  SEVERITY_NUMBERS: {},
  withNextSpan: workerSpies.withNextSpan,
}))

vi.mock("./adapters/control-plane/client", () => ({
  createAgentInternalGateway: vi.fn<() => void>(),
  toAgentControlFailure: vi.fn<() => void>(),
}))
vi.mock("./composition/isolate-composition", () => ({
  getAgentIsolateComposition: vi.fn<() => object>(() => ({
    mastra: { observability: { flush: async () => undefined } },
  })),
}))
vi.mock("./runtime/run-agent", () => ({
  handleAgentRuntimeRequest: vi.fn<() => Promise<Response>>(
    async () => new Response(null, { status: 204 })
  ),
}))

import { createAgentOtelConfig } from "./worker"

const local = {
  AGENT_INTERNAL_API: JSON.parse("{}"),
  AGENT_RUNS_ENABLED: "1",
  AGENT_VISION_ENABLED: "0",
  AGENT_WRITES_ENABLED: "1",
  DEV_SESSION_ID: "session-1",
  DEV_WORKTREE_ID: "feature-auth",
  MASTRA_STORAGE_URL: ":memory:",
  NODE_ENV: "development",
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
}

describe("Agent WorkerのOpenTelemetry境界", () => {
  it("resolverをinstrumentへ渡して固定local exportを設定する", () => {
    workerSpies.withNextSpan.mockClear()
    expect(workerSpies.instrument).toHaveBeenCalledTimes(2)
    expect(workerSpies.instrument.mock.calls.map((call) => call[1])).toEqual([
      createAgentOtelConfig,
      createAgentOtelConfig,
    ])

    const config = createAgentOtelConfig(
      local,
      new Request("https://agent.test")
    )
    expect(config).toMatchObject({
      logs: {
        batching: { strategy: "immediate" },
        instrumentation: { instrumentConsole: false },
      },
      service: { name: "enterprise-agentic-saas-agent" },
      trace: {
        batching: { strategy: "immediate" },
        exporter: { url: "http://127.0.0.1:4318/v1/traces" },
      },
    })
    expect(workerSpies.withNextSpan).toHaveBeenCalledWith({
      "dev.session.id": "session-1",
      "dev.worktree.id": "feature-auth",
      "service.name": "enterprise-agentic-saas-agent",
    })
  })

  it("本番とremoteと不完全identityを無効のままにする", () => {
    workerSpies.withNextSpan.mockClear()
    for (const environment of [
      { ...local, NODE_ENV: "production" },
      {
        ...local,
        OTEL_EXPORTER_OTLP_ENDPOINT: "https://remote.example.test",
      },
      { ...local, DEV_SESSION_ID: "" },
      { ...local, DEV_WORKTREE_ID: "" },
    ]) {
      expect(
        createAgentOtelConfig(environment, new Request("https://agent.test"))
      ).toEqual({
        service: { name: "enterprise-agentic-saas-agent" },
      })
    }
    expect(workerSpies.withNextSpan).not.toHaveBeenCalled()
  })

  it("local Agent telemetryではAPI request identityを優先する", () => {
    workerSpies.withNextSpan.mockClear()
    const request = new Request("https://agent.test/chat", {
      headers: {
        "x-dev-session-id": "api-session",
        "x-dev-worktree-id": "main",
      },
    })

    createAgentOtelConfig(
      {
        ...local,
        DEV_SESSION_ID: "agent-process-session",
      },
      request
    )

    expect(workerSpies.withNextSpan).toHaveBeenCalledWith({
      "dev.session.id": "api-session",
      "dev.worktree.id": "main",
      "service.name": "enterprise-agentic-saas-agent",
    })
  })

  it("不正なrequest identityを拒否してprocess identityを使う", () => {
    workerSpies.withNextSpan.mockClear()
    const request = new Request("https://agent.test/chat", {
      headers: {
        "x-dev-session-id": "api session",
        "x-dev-worktree-id": "main",
      },
    })

    createAgentOtelConfig(local, request)

    expect(workerSpies.withNextSpan).toHaveBeenCalledWith({
      "dev.session.id": "session-1",
      "dev.worktree.id": "feature-auth",
      "service.name": "enterprise-agentic-saas-agent",
    })
  })
})
