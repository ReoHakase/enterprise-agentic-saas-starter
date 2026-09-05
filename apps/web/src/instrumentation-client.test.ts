import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const telemetry = vi.hoisted(() => {
  const clientEnv: {
    VITE_DEV_SESSION_ID: string | undefined
    VITE_DEV_WORKTREE_ID: string | undefined
    VITE_OTEL_EXPORTER_OTLP_ENDPOINT: string | undefined
  } = {
    VITE_DEV_SESSION_ID: undefined,
    VITE_DEV_WORKTREE_ID: undefined,
    VITE_OTEL_EXPORTER_OTLP_ENDPOINT: undefined,
  }
  const register = vi.fn<() => void>()
  const spanEnd = vi.fn<() => void>()
  const startSpan = vi.fn<(name: string, options: unknown) => { end(): void }>(
    () => ({ end: spanEnd })
  )
  const getTracer = vi.fn<() => { startSpan: typeof startSpan }>(() => ({
    startSpan,
  }))
  const logExport = vi.fn<(payload: unknown) => void>()
  const traceExport = vi.fn<(payload: unknown) => void>()
  return {
    batchLogProcessor: vi.fn<(options: unknown) => void>(),
    batchSpanProcessor: vi.fn<(exporter: unknown) => void>(),
    clientEnv,
    documentLoadInstrumentation: vi.fn<(options?: unknown) => void>(),
    fetchInstrumentation: vi.fn<(options?: unknown) => void>(),
    getTracer,
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
    spanEnd,
    startSpan,
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

vi.mock("@/lib/env", () => ({ clientEnv: telemetry.clientEnv }))
vi.mock("@opentelemetry/api", () => ({
  trace: { getTracer: telemetry.getTracer },
}))
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
  DocumentLoadInstrumentation: telemetry.documentLoadInstrumentation,
}))
vi.mock("@opentelemetry/instrumentation-fetch", () => ({
  FetchInstrumentation: telemetry.fetchInstrumentation,
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
  vi.stubEnv("MODE", "development")
  telemetry.clientEnv.VITE_DEV_SESSION_ID = "session-1"
  telemetry.clientEnv.VITE_DEV_WORKTREE_ID = "feature-auth"
  telemetry.clientEnv.VITE_OTEL_EXPORTER_OTLP_ENDPOINT =
    "https://otel.enterprise-agentic-saas.localhost"
  window.history.replaceState({}, "", "/")
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
    vi.stubEnv("MODE", nodeEnv)
    telemetry.clientEnv.VITE_OTEL_EXPORTER_OTLP_ENDPOINT = endpoint
    telemetry.clientEnv.VITE_DEV_SESSION_ID = sessionId
    const { registerClientObservability } =
      await import("./instrumentation-client")

    expect(registerClientObservability()).toBe(false)
    expect(telemetry.traceExporter).not.toHaveBeenCalled()
    expect(telemetry.registerInstrumentations).not.toHaveBeenCalled()
  })

  it("routeのqueryとfragmentをnavigation spanへ保存しない", async () => {
    // Given: OAuth credentialを含むroute遷移を受け取る。
    const { onRouterTransitionStart } = await import("./instrumentation-client")

    // When: navigation spanを記録する。
    onRouterTransitionStart(
      "/oauth/organization?sig=private-signature&state=private-state#consent",
      "navigate"
    )

    // Then: pathnameだけをattributeへ残し、credentialを保存しない。
    expect(telemetry.startSpan).toHaveBeenCalledWith("navigation", {
      attributes: {
        "navigation.type": "navigate",
        "url.path": "/oauth/organization",
      },
    })
    expect(JSON.stringify(telemetry.startSpan.mock.calls)).not.toMatch(
      /private-signature|private-state/u
    )
    expect(telemetry.spanEnd).toHaveBeenCalledOnce()
  })

  it("document spanへ署名付きOAuth queryを保存しない", async () => {
    // Given: percent-encodeされたstateとsignatureを含むdocument URLがある。
    window.history.replaceState(
      {},
      "",
      "/auth/sign-in?redirectTo=%2Foauth%2Forganization%3Fstate%3Dprivate-state%26sig%3Dprivate-signature"
    )
    const { registerClientObservability } =
      await import("./instrumentation-client")
    registerClientObservability()
    const options = telemetry.documentLoadInstrumentation.mock.calls[0]?.[0]
    if (!options || typeof options !== "object")
      throw new TypeError("document load options are required")
    const customAttributes = Reflect.get(options, "applyCustomAttributesOnSpan")
    if (!customAttributes || typeof customAttributes !== "object")
      throw new TypeError("document span hooks are required")
    const documentLoadHook = Reflect.get(customAttributes, "documentLoad")
    const documentFetchHook = Reflect.get(customAttributes, "documentFetch")
    const resourceFetchHook = Reflect.get(customAttributes, "resourceFetch")
    if (
      typeof documentLoadHook !== "function" ||
      typeof documentFetchHook !== "function" ||
      typeof resourceFetchHook !== "function"
    )
      throw new TypeError("document and resource hooks are required")
    const setAttribute = vi.fn<(name: string, value: string) => void>()
    const signedResourceUrl = `${location.origin}/assets/application.js?state=private-state&sig=private-signature`

    // When: document load、document fetch、resource fetchの全spanを補正する。
    Reflect.apply(documentLoadHook, undefined, [{ setAttribute }])
    Reflect.apply(documentFetchHook, undefined, [{ setAttribute }])
    Reflect.apply(resourceFetchHook, undefined, [
      { setAttribute },
      { name: signedResourceUrl },
    ])

    // Then: originとpathnameだけを全spanへ設定する。
    expect(setAttribute).toHaveBeenNthCalledWith(
      1,
      "url.full",
      `${location.origin}/auth/sign-in`
    )
    expect(setAttribute).toHaveBeenNthCalledWith(
      2,
      "url.full",
      `${location.origin}/auth/sign-in`
    )
    expect(setAttribute).toHaveBeenNthCalledWith(
      3,
      "url.full",
      `${location.origin}/assets/application.js`
    )
    expect(JSON.stringify(setAttribute.mock.calls)).not.toMatch(
      /private-state|private-signature|%26state|%26sig/u
    )
  })

  it("server functionのfetch spanへ署名付きpayload queryを保存しない", async () => {
    // Given: TanStack StartがGET server functionへ署名付きreturnToを渡す。
    const signedUrl = `${location.origin}/_serverFn/console-me?payload=%7B%22returnTo%22%3A%22%2Foauth%2Forganization%3Fstate%3Dprivate-state%26sig%3Dprivate-signature%22%7D`
    const { registerClientObservability } =
      await import("./instrumentation-client")
    registerClientObservability()
    const options = telemetry.fetchInstrumentation.mock.calls[0]?.[0]
    if (!options || typeof options !== "object")
      throw new TypeError("fetch instrumentation options are required")
    const requestHook = Reflect.get(options, "requestHook")
    const resultHook = Reflect.get(options, "applyCustomAttributesOnSpan")
    if (typeof requestHook !== "function" || typeof resultHook !== "function")
      throw new TypeError("fetch span hooks are required")
    const setAttribute = vi.fn<(name: string, value: string) => void>()
    const response = new Response()
    Object.defineProperty(response, "url", { value: signedUrl })

    // When: string URL + RequestInitの開始時と成功responseの終了時を補正する。
    Reflect.apply(requestHook, undefined, [{ setAttribute }, { method: "GET" }])
    Reflect.apply(resultHook, undefined, [
      { setAttribute },
      { method: "GET" },
      response,
    ])

    // Then: 開始時にもcredentialを消し、終了時には対象pathnameだけを復元する。
    expect(setAttribute).toHaveBeenNthCalledWith(
      1,
      "url.full",
      `${location.origin}/`
    )
    expect(setAttribute).toHaveBeenNthCalledWith(
      2,
      "url.full",
      `${location.origin}/_serverFn/console-me`
    )
    expect(JSON.stringify(setAttribute.mock.calls)).not.toMatch(
      /private-state|private-signature|%26state|%26sig/u
    )
  })
})
