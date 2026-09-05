import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const telemetry = vi.hoisted(() => {
  const loggerError =
    vi.fn<(message: string, attributes?: Record<string, unknown>) => void>()
  const startFetch = vi.fn<(request: Request) => Promise<Response>>(
    async () => new Response("ok")
  )
  const state: {
    config?: (environment: Record<string, string>) => unknown
    handler?: {
      fetch(
        request: Request,
        environment: Record<string, string>,
        context: { waitUntil(promise: Promise<unknown>): void }
      ): Promise<Response> | Response
    }
  } = {}
  return {
    defaultStreamHandler: vi.fn<(...args: unknown[]) => unknown>(),
    getLogger: vi.fn<() => { error: typeof loggerError }>(() => ({
      error: loggerError,
    })),
    instrument: vi.fn<
      (
        handler: NonNullable<typeof state.handler>,
        config: NonNullable<typeof state.config>
      ) => NonNullable<typeof state.handler>
    >(
      (
        handler: NonNullable<typeof state.handler>,
        config: NonNullable<typeof state.config>
      ) => {
        state.handler = handler
        state.config = config
        return handler
      }
    ),
    loggerError,
    otlpTransport: vi.fn<(options: unknown) => { options: unknown }>(
      function MockOTLPTransport(options: unknown) {
        return { options }
      }
    ),
    startFetch,
    state,
    withNextSpan: vi.fn<(attributes: Record<string, string>) => void>(),
  }
})

vi.mock("@inference-net/otel-cf-workers", () => ({
  getLogger: telemetry.getLogger,
  instrument: telemetry.instrument,
  OTLPTransport: telemetry.otlpTransport,
  withNextSpan: telemetry.withNextSpan,
}))
vi.mock("@tanstack/react-start/server", () => ({
  createStartHandler: vi.fn<() => typeof telemetry.startFetch>(
    () => telemetry.startFetch
  ),
  defaultStreamHandler: telemetry.defaultStreamHandler,
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  telemetry.state.config = undefined
  telemetry.state.handler = undefined
})

afterEach(() => vi.restoreAllMocks())

describe("TanStack Start Web Worker OpenTelemetry", () => {
  it("Given local identity, When configを解決する, Then traceとlogを固定loopbackへ送る", async () => {
    const { resolveWebOtelConfig } = await import("../server")

    const config = resolveWebOtelConfig({
      DEV_SESSION_ID: "session-1",
      DEV_WORKTREE_ID: "feature-auth",
      NODE_ENV: "development",
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
    })

    expect(telemetry.withNextSpan).toHaveBeenCalledWith({
      "dev.session.id": "session-1",
      "dev.worktree.id": "feature-auth",
      "service.name": "enterprise-agentic-saas-web-server",
    })
    expect(telemetry.otlpTransport).toHaveBeenCalledWith({
      url: "http://127.0.0.1:4318/v1/logs",
    })
    expect(config).toMatchObject({
      logs: {
        batching: { strategy: "immediate" },
        instrumentation: { instrumentConsole: false },
      },
      service: { name: "enterprise-agentic-saas-web-server" },
      trace: {
        batching: { strategy: "immediate" },
        exporter: { url: "http://127.0.0.1:4318/v1/traces" },
      },
    })
  })

  it("Given 署名付きOAuth URL, When traceをexportする, Then queryを保存しない", async () => {
    // Given: percent-encodeされたstateとsignatureを含む受信spanがある。
    const { resolveWebOtelConfig } = await import("../server")
    const config = resolveWebOtelConfig({
      DEV_SESSION_ID: "session-1",
      DEV_WORKTREE_ID: "feature-auth",
      NODE_ENV: "development",
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
    })
    const traceConfig = Reflect.get(config, "trace")
    if (!traceConfig) throw new Error("trace config is required")
    const postProcessor = Reflect.get(traceConfig, "postProcessor")
    if (typeof postProcessor !== "function")
      throw new TypeError("trace post processor is required")
    const attributes: Record<string, unknown> = {
      "http.response.status_code": 302,
      "url.full":
        "https://web.example.test/auth/sign-in?redirectTo=%2Foauth%2Forganization%3Fstate%3Dprivate-state%26sig%3Dprivate-signature",
      "url.query":
        "redirectTo=%2Foauth%2Forganization%3Fstate%3Dprivate-state%26sig%3Dprivate-signature",
    }

    // When: Worker instrumentationのpost processorを通す。
    const spans = Reflect.apply(postProcessor, undefined, [[{ attributes }]])

    // Then: originとpathname、無関係な属性だけを残す。
    expect(spans).toHaveLength(1)
    expect(attributes).toEqual({
      "http.response.status_code": 302,
      "url.full": "https://web.example.test/auth/sign-in",
    })
    expect(JSON.stringify(attributes)).not.toMatch(
      /private-state|private-signature|%26state|%26sig/u
    )
  })

  it.each([
    ["production", "http://127.0.0.1:4318", "session-1", "worktree-1"],
    ["development", "https://remote.example.test", "session-1", "worktree-1"],
    ["development", "http://127.0.0.1:4318", "", "worktree-1"],
    ["development", "http://127.0.0.1:4318", "session-1", ""],
  ])(
    "Given local条件が不足する, When configを解決する, Then exporterを構成しない",
    async (nodeEnv, endpoint, sessionId, worktreeId) => {
      const { resolveWebOtelConfig } = await import("../server")

      expect(
        resolveWebOtelConfig({
          DEV_SESSION_ID: sessionId,
          DEV_WORKTREE_ID: worktreeId,
          NODE_ENV: nodeEnv,
          OTEL_EXPORTER_OTLP_ENDPOINT: endpoint,
        })
      ).toEqual({
        service: { name: "enterprise-agentic-saas-web-server" },
      })
      expect(telemetry.withNextSpan).not.toHaveBeenCalled()
      expect(telemetry.otlpTransport).not.toHaveBeenCalled()
    }
  )

  it("Given Worker request, When fetchする, Then TanStack Start標準handlerへ委譲する", async () => {
    const worker = (await import("../server")).default
    const request = new Request("https://example.test/docs")
    const waitUntil = vi.fn<(promise: Promise<unknown>) => void>()

    const response = await worker.fetch?.(request, {}, { waitUntil })

    expect(response).toBeInstanceOf(Response)
    expect(await response?.text()).toBe("ok")
    expect(telemetry.startFetch).toHaveBeenCalledWith(request)
  })

  it("Given Markdown Acceptのdocument request, When fetchする, Then HTML routeとして標準handlerへ委譲する", async () => {
    telemetry.startFetch.mockImplementationOnce(
      async (request) => new Response(request.headers.get("accept"))
    )
    const worker = (await import("../server")).default
    const request = new Request("https://example.test/docs/developers/mcp", {
      headers: { Accept: "text/markdown" },
    })

    const response = await worker.fetch?.(
      request,
      {},
      {
        waitUntil: vi.fn<(promise: Promise<unknown>) => void>(),
      }
    )

    expect(await response?.text()).toBe("text/markdown, text/html")
    expect(request.headers.get("accept")).toBe("text/markdown")
  })

  it("Given redirect response, When Workerが返す, Then statusと既存headerを保持して共通headerを付与する", async () => {
    const headers = new Headers({
      Location: "/invitations/invitation-1",
      "X-Redirect-Context": "legacy-invitation",
    })
    telemetry.startFetch.mockResolvedValueOnce(
      new Response(null, { headers, status: 307 })
    )
    const worker = (await import("../server")).default

    const response = await worker.fetch?.(
      new Request("https://example.test/organization/invitations/invitation-1"),
      {},
      { waitUntil: vi.fn<(promise: Promise<unknown>) => void>() }
    )

    expect(response?.status).toBe(307)
    expect(response?.headers.get("location")).toBe("/invitations/invitation-1")
    expect(response?.headers.get("x-redirect-context")).toBe(
      "legacy-invitation"
    )
    expect(response?.headers.get("content-security-policy")).toContain(
      "connect-src 'self'"
    )
    expect(response?.headers.get("referrer-policy")).toBe("same-origin")
    expect(await response?.text()).toBe("")
  })

  it.each([
    ["public", "/docs/?topic=MCP&topic=OAuth", "/docs?topic=MCP&topic=OAuth"],
    [
      "console",
      "/organization/alpha-operations/issues/?page=2",
      "/organization/alpha-operations/issues?page=2",
    ],
  ])(
    "Given末尾slash付き%s route, When Workerが受ける, Then queryを保持した308へ正規化する",
    async (_, requestPath, expectedLocation) => {
      const worker = (await import("../server")).default

      const response = await worker.fetch?.(
        new Request(`https://example.test${requestPath}`),
        {},
        { waitUntil: vi.fn<(promise: Promise<unknown>) => void>() }
      )

      expect(response?.status).toBe(308)
      expect(response?.headers.get("location")).toBe(expectedLocation)
      expect(response?.headers.get("content-security-policy")).toContain(
        "connect-src 'self'"
      )
      expect(response?.headers.get("referrer-policy")).toBe("same-origin")
      expect(telemetry.startFetch).not.toHaveBeenCalled()
    }
  )

  it.each([
    ["root", "https://example.test/", undefined],
    ["server function", "https://example.test/_serverFn/", "true"],
    ["build asset", "https://example.test/assets/", undefined],
  ])(
    "Given %s path, When Workerが受ける, Then canonical redirectを適用しない",
    async (_, requestUrl, serverFunctionHeader) => {
      const worker = (await import("../server")).default
      const headers = serverFunctionHeader
        ? { "x-tsr-serverFn": serverFunctionHeader }
        : undefined
      const request = new Request(requestUrl, { headers })

      const response = await worker.fetch?.(
        request,
        {},
        {
          waitUntil: vi.fn<(promise: Promise<unknown>) => void>(),
        }
      )

      expect(response?.status).toBe(200)
      expect(await response?.text()).toBe("ok")
      expect(telemetry.startFetch).toHaveBeenCalledWith(request)
    }
  )

  it("Given sanitized cause record, When server log sinkへ渡す, Then Workers loggerへ送る", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    await import("../server")
    const { reportDevelopmentCauseChain } =
      await import("@/lib/development-error")

    reportDevelopmentCauseChain(
      {
        endpoint: "http://127.0.0.1:4318",
        isBrowser: false,
        nodeEnv: "development",
        sessionId: "session-1",
        worktreeId: "worktree-1",
      },
      new Error("sanitized failure"),
      {
        "app.error.code": "internal_error",
        "app.operation": "web.request",
        "app.outcome": "failure",
      }
    )

    expect(telemetry.getLogger).toHaveBeenCalledWith(
      "enterprise-agentic-saas-web-server"
    )
    expect(telemetry.loggerError).toHaveBeenCalledWith(
      "Web development exception cause",
      expect.objectContaining({
        "dev.session.id": "session-1",
        "exception.message": "sanitized failure",
      })
    )
  })
})
