import { notFound, redirect } from "@tanstack/react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  reportObservedError: vi.fn<(error: unknown, context: unknown) => void>(),
  setResponseStatus: vi.fn<(status: number) => void>(),
}))

vi.mock("@/lib/report-observed-error", () => ({
  reportObservedError: mocks.reportObservedError,
}))
vi.mock("@tanstack/react-start/server", () => ({
  setResponseStatus: mocks.setResponseStatus,
}))

import { startInstance } from "../../start"

const callMiddlewareServer = async (
  kind: "function" | "request",
  context: Record<string, unknown>
): Promise<unknown> => {
  const options = await startInstance.getOptions()
  const middleware =
    kind === "function"
      ? options.functionMiddleware?.[0]
      : options.requestMiddleware?.[0]
  const server = middleware?.options.server
  if (typeof server !== "function")
    throw new TypeError(`${kind} middleware server is required`)
  return Reflect.apply(server, undefined, [context])
}

const callFunctionMiddleware = (next: () => Promise<unknown>) =>
  callMiddlewareServer("function", {
    context: {},
    data: undefined,
    method: "GET",
    next,
    serverFnMeta: {},
    signal: new AbortController().signal,
  })

beforeEach(() => vi.clearAllMocks())

describe("TanStack Start global middleware", () => {
  it("Given secretを含む生エラー, When server functionが失敗する, Then 固定公開エラーだけを返す", async () => {
    // Given: downstream由来の認証情報を含むErrorをserver functionが投げる。
    const sourceError = new Error("TURSO_AUTH_TOKEN=private-sentinel")

    // When: global function middlewareを通す。
    let publicError: unknown
    try {
      await callFunctionMiddleware(async () => {
        throw sourceError
      })
    } catch (error) {
      publicError = error
    }

    // Then: local reporterだけが原因を受け、handlerへはcauseのない固定Errorを渡す。
    expect(mocks.reportObservedError).toHaveBeenCalledWith(sourceError, {
      operation: "web.server-function",
    })
    expect(mocks.setResponseStatus).toHaveBeenCalledWith(500)
    expect(publicError).toBeInstanceOf(Error)
    if (!(publicError instanceof Error))
      throw new TypeError("public Error is required")
    expect(publicError.message).toBe("The service is temporarily unavailable.")
    expect(publicError.cause).toBeUndefined()
    expect(
      JSON.stringify({
        cause: publicError.cause,
        message: publicError.message,
        stack: publicError.stack,
      })
    ).not.toContain("private-sentinel")
  })

  it.each([
    ["redirect", redirect({ href: "/auth/sign-in" })],
    ["not found", notFound()],
    ["Response", new Response(null, { status: 401 })],
  ])(
    "Given %s制御フロー, When server functionから投げる, Then 同じ値を維持する",
    async (_, controlFlow) => {
      // Given: TanStack RouterまたはFetch APIが所有する制御フローがある。
      const next = async () => {
        throw controlFlow
      }

      // When / Then: 固定Errorへ変換せず同一identityで再送出する。
      await expect(callFunctionMiddleware(next)).rejects.toBe(controlFlow)
      expect(mocks.reportObservedError).not.toHaveBeenCalled()
      expect(mocks.setResponseStatus).not.toHaveBeenCalled()
    }
  )

  it("Given cross-site server function request, When request middlewareを通す, Then 403で拒否する", async () => {
    // Given: cross-siteからserver function endpointへ送られたrequestがある。
    const next = vi.fn<() => Promise<Response>>(async () => new Response("ok"))

    // When: global CSRF middlewareを通す。
    const response = await callMiddlewareServer("request", {
      context: {},
      handlerType: "serverFn",
      next,
      request: new Request("https://web.example.test/_serverFn/example", {
        headers: { "Sec-Fetch-Site": "cross-site" },
      }),
    })

    // Then: server functionを実行せず公式の403応答を返す。
    expect(response).toBeInstanceOf(Response)
    if (!(response instanceof Response))
      throw new TypeError("CSRF Response is required")
    expect(response.status).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })
})
