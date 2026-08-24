import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const telemetry = vi.hoisted(() => {
  const start = vi.fn<() => void>()
  const traceExport = vi.fn<(payload: unknown) => void>()
  const traceExporterInstance = {
    export: traceExport,
    forceFlush: async () => undefined,
    shutdown: async () => undefined,
  }
  return {
    logExporter: vi.fn<(options: unknown) => void>(),
    resource: vi.fn<(attributes: unknown) => { attributes: unknown }>(
      (attributes) => ({ attributes })
    ),
    sdk: vi.fn<(options: unknown) => { start(): void }>(function nodeSdk() {
      return { start }
    }),
    start,
    reportObservedError: vi.fn<(...args: unknown[]) => void>(),
    traceExport,
    traceExporter: vi.fn<(options: unknown) => object>(
      function traceExporter() {
        return traceExporterInstance
      }
    ),
  }
})

vi.mock("server-only", () => ({}))
vi.mock("@opentelemetry/exporter-logs-otlp-proto", () => ({
  OTLPLogExporter: telemetry.logExporter,
}))
vi.mock("@opentelemetry/exporter-trace-otlp-proto", () => ({
  OTLPTraceExporter: telemetry.traceExporter,
}))
vi.mock("@opentelemetry/resources", () => ({
  resourceFromAttributes: telemetry.resource,
}))
vi.mock("@opentelemetry/sdk-logs", () => ({
  BatchLogRecordProcessor: vi.fn<(options: unknown) => void>(),
}))
vi.mock("@opentelemetry/sdk-node", () => ({
  NodeSDK: telemetry.sdk,
}))
vi.mock("@/lib/report-observed-error", () => ({
  reportObservedError: telemetry.reportObservedError,
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  process.env.DEV_SESSION_ID = "session-1"
  process.env.DEV_WORKTREE_ID = "feature-auth"
  vi.stubEnv("NODE_ENV", "development")
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:4318"
})

afterEach(() => vi.unstubAllEnvs())

describe("Next.js サーバー OpenTelemetry 登録", () => {
  it("ローカルtrace・logをresource identity付きで1回だけ登録する", async () => {
    const { registerServerObservability } = await import("./instrumentation")

    expect(registerServerObservability()).toBe(true)
    expect(registerServerObservability()).toBe(true)

    expect(telemetry.sdk).toHaveBeenCalledOnce()
    expect(telemetry.traceExporter).toHaveBeenCalledWith({
      url: "http://127.0.0.1:4318/v1/traces",
    })
    expect(telemetry.logExporter).toHaveBeenCalledWith({
      url: "http://127.0.0.1:4318/v1/logs",
    })
    expect(telemetry.resource).toHaveBeenCalledWith({
      "dev.session.id": "session-1",
      "dev.worktree.id": "feature-auth",
      "service.name": "enterprise-agentic-saas-web-server",
    })
    expect(telemetry.start).toHaveBeenCalledOnce()
  })

  it.each([
    ["本番環境", "production", "http://127.0.0.1:4318", "session-1"],
    [
      "remote endpointの指定",
      "development",
      "https://remote.example.test",
      "session-1",
    ],
    ["identityの欠落", "development", "http://127.0.0.1:4318", ""],
  ])("%sでは無効のままにする", async (_, nodeEnv, endpoint, sessionId) => {
    vi.stubEnv("NODE_ENV", nodeEnv)
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = endpoint
    process.env.DEV_SESSION_ID = sessionId
    const { registerServerObservability } = await import("./instrumentation")

    expect(registerServerObservability()).toBe(false)
    expect(telemetry.sdk).not.toHaveBeenCalled()
  })

  it("上限付きNext.js contextと元のリクエストエラーを転送する", async () => {
    const { onRequestError } = await import("./instrumentation")
    const error = new Error("server render failed")

    await onRequestError(
      error,
      {
        headers: { "x-request-id": "request-1" },
        method: "POST",
        path: "/organization/acme/settings?private=not-forwarded",
      },
      {
        revalidateReason: undefined,
        routePath: "/organization/[organizationSlug]/settings",
        routerKind: "App Router",
        routeType: "render",
      }
    )

    expect(telemetry.reportObservedError).toHaveBeenCalledWith(error, {
      httpMethod: "POST",
      httpRoute: "/organization/[organizationSlug]/settings",
      operation: "next.request",
      requestId: "request-1",
    })
  })
})
