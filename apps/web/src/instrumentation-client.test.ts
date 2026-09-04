import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const telemetry = vi.hoisted(() => {
  const clientEnv: {
    NEXT_PUBLIC_DEV_SESSION_ID: string | undefined
    NEXT_PUBLIC_DEV_WORKTREE_ID: string | undefined
    NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT: string | undefined
  } = {
    NEXT_PUBLIC_DEV_SESSION_ID: undefined,
    NEXT_PUBLIC_DEV_WORKTREE_ID: undefined,
    NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT: undefined,
  }
  const register = vi.fn<() => void>()
  const logExport = vi.fn<(payload: unknown) => void>()
  const traceExport = vi.fn<(payload: unknown) => void>()
  return {
    batchLogProcessor: vi.fn<(options: unknown) => void>(),
    batchSpanProcessor: vi.fn<(exporter: unknown) => void>(),
    clientEnv,
    logExport,
    logExporter: vi.fn<(options: unknown) => object>(function logExporter() {
      return {
        export: logExport,
        forceFlush: async () => undefined,
        shutdown: async () => undefined,
      }
    }),
    loggerProvider: vi.fn<(options: unknown) => void>(),
    register,
    registerInstrumentations: vi.fn<(options: unknown) => void>(),
    resource: vi.fn<(attributes: unknown) => { attributes: unknown }>(
      (attributes) => ({ attributes })
    ),
    traceExport,
    traceExporter: vi.fn<(options: unknown) => object>(
      function traceExporter() {
        return {
          export: traceExport,
          forceFlush: async () => undefined,
          shutdown: async () => undefined,
        }
      }
    ),
    webTracerProvider: vi.fn<(options: unknown) => { register(): void }>(
      function webTracerProvider() {
        return { register }
      }
    ),
  }
})

vi.mock("@/lib/env.client", () => ({ clientEnv: telemetry.clientEnv }))
vi.mock("@opentelemetry/api", () => ({ trace: {} }))
vi.mock("@opentelemetry/api-logs", () => ({
  logs: { setGlobalLoggerProvider: telemetry.loggerProvider },
}))
vi.mock("@opentelemetry/exporter-logs-otlp-http", () => ({
  OTLPLogExporter: telemetry.logExporter,
}))
vi.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
  OTLPTraceExporter: telemetry.traceExporter,
}))
vi.mock("@opentelemetry/instrumentation", () => ({
  registerInstrumentations: telemetry.registerInstrumentations,
}))
vi.mock("@opentelemetry/instrumentation-document-load", () => ({
  DocumentLoadInstrumentation: vi.fn<() => void>(),
}))
vi.mock("@opentelemetry/instrumentation-fetch", () => ({
  FetchInstrumentation: vi.fn<(options: unknown) => void>(),
}))
vi.mock("@opentelemetry/resources", () => ({
  resourceFromAttributes: telemetry.resource,
}))
vi.mock("@opentelemetry/sdk-logs", () => ({
  BatchLogRecordProcessor: telemetry.batchLogProcessor,
  LoggerProvider: telemetry.loggerProvider,
}))
vi.mock("@opentelemetry/sdk-trace-web", () => ({
  BatchSpanProcessor: telemetry.batchSpanProcessor,
  WebTracerProvider: telemetry.webTracerProvider,
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  vi.stubEnv("NODE_ENV", "development")
  telemetry.clientEnv.NEXT_PUBLIC_DEV_SESSION_ID = "session-1"
  telemetry.clientEnv.NEXT_PUBLIC_DEV_WORKTREE_ID = "feature-auth"
  telemetry.clientEnv.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT =
    "https://otel.enterprise-agentic-saas.localhost"
})

afterEach(() => vi.unstubAllEnvs())

describe("ブラウザーのOpenTelemetry登録", () => {
  it("ローカルtrace・log・identityとブラウザーinstrumentationを1回だけ登録する", async () => {
    const { registerClientObservability } =
      await import("./instrumentation-client")

    expect(registerClientObservability()).toBe(true)
    expect(registerClientObservability()).toBe(true)

    expect(telemetry.traceExporter).toHaveBeenCalledOnce()
    expect(telemetry.traceExporter).toHaveBeenCalledWith({
      url: "https://otel.enterprise-agentic-saas.localhost/v1/traces",
    })
    expect(telemetry.logExporter).toHaveBeenCalledWith({
      url: "https://otel.enterprise-agentic-saas.localhost/v1/logs",
    })
    expect(telemetry.resource).toHaveBeenCalledWith({
      "dev.session.id": "session-1",
      "dev.worktree.id": "feature-auth",
      "service.name": "enterprise-agentic-saas-web-browser",
    })
    expect(telemetry.register).toHaveBeenCalledOnce()
    expect(telemetry.registerInstrumentations).toHaveBeenCalledOnce()
  })

  it.each([
    [
      "本番環境",
      "production",
      "https://otel.enterprise-agentic-saas.localhost",
      "session-1",
    ],
    [
      "remote endpointの指定",
      "development",
      "https://remote.example.test",
      "session-1",
    ],
    [
      "identityの欠落",
      "development",
      "https://otel.enterprise-agentic-saas.localhost",
      "",
    ],
  ])("%sでは無効のままにする", async (_, nodeEnv, endpoint, sessionId) => {
    vi.stubEnv("NODE_ENV", nodeEnv)
    telemetry.clientEnv.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT = endpoint
    telemetry.clientEnv.NEXT_PUBLIC_DEV_SESSION_ID = sessionId
    const { registerClientObservability } =
      await import("./instrumentation-client")

    expect(registerClientObservability()).toBe(false)
    expect(telemetry.traceExporter).not.toHaveBeenCalled()
    expect(telemetry.registerInstrumentations).not.toHaveBeenCalled()
  })
})
