import { Elysia, ValidationError } from "elysia"
import * as v from "valibot"
import { describe, expect, it, vi } from "vitest"

type CapturedErrorContext = {
  errorCode: string
  method: string
  requestId: string
  route: string
  statusCode: number
}

const observability = vi.hoisted(() => ({
  captureException:
    vi.fn<(error: unknown, context: CapturedErrorContext) => void>(),
  recordHttpStatus: vi.fn<(statusCode: number, errorCode?: string) => void>(),
}))

vi.mock("../observability/runtime", () => ({
  captureObservedException: observability.captureException,
  recordObservedHttpStatus: observability.recordHttpStatus,
}))

import { HttpError } from "../../errors/http-error"
import { errorPlugin, projectErrorForResponse } from "./error"
import { requestIdPlugin } from "./request-id"

const resetObservability = () => {
  observability.captureException.mockClear()
  observability.recordHttpStatus.mockClear()
}

describe("errorPlugin", () => {
  it("treats response validation as an observed internal defect", async () => {
    resetObservability()
    const secret = "TURSO_AUTH_TOKEN=private-response-value"
    const responseModel = v.object({ status: v.literal("ok") })
    const invalidResponse = JSON.parse(JSON.stringify({ status: secret }))
    const app = new Elysia()
      .use(requestIdPlugin)
      .use(errorPlugin)
      .get("/invalid-response", () => invalidResponse, {
        response: { 200: responseModel },
      })

    const response = await app.handle(
      new Request("http://localhost/invalid-response", {
        headers: { "x-request-id": "req_response_validation" },
      })
    )
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("x-request-id")).toBe("req_response_validation")
    expect(body).toEqual({
      error: "internal_error",
      message: "An unexpected error occurred.",
    })
    expect(JSON.stringify(body)).not.toContain(secret)
    expect(observability.recordHttpStatus).toHaveBeenCalledWith(
      500,
      "internal_error"
    )
    const capturedError = observability.captureException.mock.calls[0]?.[0]
    expect(capturedError).toBeInstanceOf(ValidationError)
    expect(observability.captureException).toHaveBeenCalledWith(capturedError, {
      errorCode: "internal_error",
      method: "GET",
      requestId: "req_response_validation",
      route: "/invalid-response",
      statusCode: 500,
    })
  })

  it("captures the original 5xx cause and exposes retry metadata only as a header", async () => {
    resetObservability()
    const cause = new Error("TURSO_AUTH_TOKEN=private-dependency-value")
    const app = new Elysia()
      .use(requestIdPlugin)
      .use(errorPlugin)
      .get("/unavailable", () => {
        throw new HttpError({
          cause,
          code: "service_unavailable",
          fieldErrors: { token: ["private-field-value"] },
          publicMessage: "provider token=private-public-value",
          retryAfter: 17,
        })
      })

    const response = await app.handle(
      new Request("http://localhost/unavailable", {
        headers: { "x-request-id": "req_unavailable" },
      })
    )
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("retry-after")).toBe("17")
    expect(body).toEqual({
      error: "service_unavailable",
      message: "The service is temporarily unavailable.",
    })
    expect(JSON.stringify(body)).not.toMatch(
      /private-field-value|private-public-value/u
    )
    expect(observability.captureException).toHaveBeenCalledOnce()
    expect(observability.captureException.mock.calls[0]?.[0]).toBe(cause)
  })

  it("does not capture expected 4xx errors", async () => {
    resetObservability()
    const app = new Elysia()
      .use(requestIdPlugin)
      .use(errorPlugin)
      .get("/forbidden", () => {
        throw new HttpError({ code: "forbidden" })
      })

    const response = await app.handle(
      new Request("http://localhost/forbidden", {
        headers: { "x-request-id": "req_forbidden" },
      })
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: "forbidden",
      message: "You do not have permission to perform this action.",
    })
    expect(response.headers.get("retry-after")).toBeNull()
    expect(observability.captureException).not.toHaveBeenCalled()
  })

  it("returns an explicitly public message and bounded field errors for 4xx", async () => {
    resetObservability()
    const app = new Elysia()
      .use(requestIdPlugin)
      .use(errorPlugin)
      .get("/conflict", () => {
        throw new HttpError({
          code: "conflict",
          fieldErrors: {
            __proto__: ["unsafe"],
            name: ["Choose another name."],
            title: ["x".repeat(501)],
          },
          publicMessage: "Choose different values.",
        })
      })

    const response = await app.handle(new Request("http://localhost/conflict"))

    expect(await response.json()).toEqual({
      error: "conflict",
      fieldErrors: { name: ["Choose another name."] },
      message: "Choose different values.",
    })
    expect(observability.captureException).not.toHaveBeenCalled()
  })

  it("projects request validation to safe field paths without echoing values", async () => {
    resetObservability()
    const secret = "token=private-input-value"
    const app = new Elysia()
      .use(requestIdPlugin)
      .use(errorPlugin)
      .post("/validation", () => ({ ok: true }), {
        body: v.object({
          title: v.pipe(v.string(), v.minLength(1), v.maxLength(10)),
        }),
      })

    const response = await app.handle(
      new Request("http://localhost/validation", {
        body: JSON.stringify({ title: secret }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
    )
    const body = await response.json()

    expect(body).toEqual({
      error: "validation_error",
      fieldErrors: { title: ["Invalid value."] },
      message: "The request is invalid.",
    })
    expect(JSON.stringify(body)).not.toContain(secret)
    expect(observability.captureException).not.toHaveBeenCalled()
  })

  it("treats malformed JSON as an expected validation failure", async () => {
    resetObservability()
    const app = new Elysia()
      .use(requestIdPlugin)
      .use(errorPlugin)
      .post("/parse", () => ({ ok: true }), {
        body: v.object({ title: v.string() }),
      })

    const response = await app.handle(
      new Request("http://localhost/parse", {
        body: "{",
        headers: { "content-type": "application/json" },
        method: "POST",
      })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: "validation_error",
      message: "The request is invalid.",
    })
    expect(observability.recordHttpStatus).toHaveBeenCalledWith(
      400,
      "validation_error"
    )
    expect(observability.captureException).not.toHaveBeenCalled()
  })

  it("does not invent an undefined field path for root validation", async () => {
    resetObservability()
    const app = new Elysia()
      .use(requestIdPlugin)
      .use(errorPlugin)
      .post("/root-validation", () => ({ ok: true }), {
        body: v.object({ title: v.string() }),
      })

    const response = await app.handle(
      new Request("http://localhost/root-validation", {
        body: "null",
        headers: { "content-type": "application/json" },
        method: "POST",
      })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: "validation_error",
      message: "The request is invalid.",
    })
    expect(observability.captureException).not.toHaveBeenCalled()
  })

  it("returns a bounded response while preserving a hostile unknown for capture", () => {
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new Error("private proxy value")
        },
      }
    )

    const projection = projectErrorForResponse("UNKNOWN", hostile)

    expect(projection.body).toEqual({
      error: "internal_error",
      message: "An unexpected error occurred.",
    })
    expect(projection.httpStatus).toBe(500)
    expect(projection.capture?.value).toBe(hostile)
  })

  it("captures an unknown thrown value exactly once without wrapping it", async () => {
    resetObservability()
    const thrown = { detail: "DATABASE_URL=private-integration-value" }
    const app = new Elysia()
      .use(requestIdPlugin)
      .use(errorPlugin)
      .get("/unknown-error", () => {
        throw thrown
      })

    const response = await app.handle(
      new Request("http://localhost/unknown-error", {
        headers: { "x-request-id": "req_unknown_error" },
      })
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: "internal_error",
      message: "An unexpected error occurred.",
    })
    expect(observability.captureException).toHaveBeenCalledOnce()
    expect(observability.captureException.mock.calls[0]?.[0]).toBe(thrown)
  })

  it("does not confuse an undefined unknown with the no-capture sentinel", () => {
    const projection = projectErrorForResponse("UNKNOWN", undefined)

    expect(projection.body).toEqual({
      error: "internal_error",
      message: "An unexpected error occurred.",
    })
    expect(projection.capture).toBeDefined()
    expect(projection.capture?.value).toBeUndefined()
  })
})
