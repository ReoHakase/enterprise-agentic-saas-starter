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

const errorCorpus = [
  {
    name: "string",
    create: () => "TURSO_AUTH_TOKEN=private-string-value",
  },
  { name: "number", create: () => 42 },
  { name: "null", create: () => null },
  {
    name: "plain object",
    create: () => ({ message: "DATABASE_URL=private-object-value" }),
  },
  {
    name: "throwing getter",
    create: () =>
      Object.defineProperty({}, "message", {
        enumerable: true,
        get: () => {
          throw new Error("private getter value")
        },
      }),
  },
  {
    name: "hostile proxy",
    create: () =>
      new Proxy(
        {},
        {
          getPrototypeOf: () => {
            throw new Error("private proxy value")
          },
        }
      ),
  },
  {
    name: "circular object",
    create: () => {
      const value: { message: string; self?: unknown } = {
        message: "private circular value",
      }
      value.self = value
      return value
    },
  },
  {
    name: "prototype-shaped object",
    create: () => ({
      ["__proto__"]: "private prototype value",
      constructor: "private constructor value",
    }),
  },
] as const

vi.mock("../observability/runtime", () => ({
  captureObservedException: observability.captureException,
  recordObservedHttpStatus: observability.recordHttpStatus,
}))

import { publicErrors } from "../../errors/app-error"
import { errorPlugin, projectErrorForResponse } from "./error"
import { requestIdPlugin } from "./request-id"

describe("errorPlugin", () => {
  it("treats response validation as an observed internal defect", async () => {
    observability.captureException.mockClear()
    observability.recordHttpStatus.mockClear()
    const secret = "TURSO_AUTH_TOKEN=private-response-value"
    const responseModel = v.object({
      status: v.pipe(
        v.string(),
        v.check((value) => value === "ok")
      ),
    })
    const app = new Elysia()
      .use(requestIdPlugin)
      .use(errorPlugin)
      .get("/invalid-response", () => ({ status: secret }), {
        response: {
          200: responseModel,
        },
      })

    const response = await app.handle(
      new Request("http://localhost/invalid-response", {
        headers: { "x-request-id": "req_response_validation" },
      })
    )
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(body).toEqual({
      error: {
        code: "internal_error",
        message: "Internal server error",
        requestId: "req_response_validation",
      },
    })
    expect(JSON.stringify(body)).not.toContain(secret)
    expect(observability.recordHttpStatus).toHaveBeenCalledWith(
      500,
      "internal_error"
    )
    const capturedError = observability.captureException.mock.calls[0]?.[0]
    expect(capturedError).toBeInstanceOf(ValidationError)
    if (!(capturedError instanceof ValidationError)) {
      throw new Error("Expected Elysia response validation error")
    }
    expect(capturedError.type).toBe("response")
    expect(observability.captureException).toHaveBeenCalledWith(capturedError, {
      errorCode: "internal_error",
      method: "GET",
      requestId: "req_response_validation",
      route: "/invalid-response",
      statusCode: 500,
    })
  })

  it("uses registry retry and capture policies without leaking the cause", async () => {
    observability.captureException.mockClear()
    observability.recordHttpStatus.mockClear()
    const secret = "TURSO_AUTH_TOKEN=private-dependency-value"
    const app = new Elysia()
      .use(requestIdPlugin)
      .use(errorPlugin)
      .get("/unavailable", () => {
        throw publicErrors.unavailable(new Error(secret), 17)
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
      error: {
        code: "service_unavailable",
        context: { retryAfter: 17 },
        message: "Service temporarily unavailable",
        requestId: "req_unavailable",
      },
    })
    expect(JSON.stringify(body)).not.toContain(secret)
    expect(observability.captureException).toHaveBeenCalledOnce()
  })

  it("does not capture registry errors whose capture policy is disabled", async () => {
    observability.captureException.mockClear()
    observability.recordHttpStatus.mockClear()
    const app = new Elysia()
      .use(requestIdPlugin)
      .use(errorPlugin)
      .get("/forbidden", () => {
        throw publicErrors.forbidden()
      })

    const response = await app.handle(
      new Request("http://localhost/forbidden", {
        headers: { "x-request-id": "req_forbidden" },
      })
    )

    expect(response.status).toBe(403)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("retry-after")).toBeNull()
    expect(observability.captureException).not.toHaveBeenCalled()
  })

  it.each(errorCorpus)(
    "projects a hostile $name through the bounded internal error contract",
    ({ create }) => {
      const thrown = create()
      const projection = projectErrorForResponse(
        "UNKNOWN",
        thrown,
        "req_hostile_error"
      )

      expect(projection).toEqual({
        httpStatus: 500,
        retryAfter: undefined,
        body: {
          error: {
            code: "internal_error",
            message: "Internal server error",
            requestId: "req_hostile_error",
          },
        },
      })
      expect(JSON.stringify(projection)).not.toMatch(
        /TURSO_AUTH_TOKEN|DATABASE_URL|private/iu
      )
    }
  )

  it("keeps the integration response bounded for unknown thrown errors", async () => {
    observability.captureException.mockClear()
    observability.recordHttpStatus.mockClear()
    const secret = "DATABASE_URL=private-integration-value"
    const app = new Elysia()
      .use(requestIdPlugin)
      .use(errorPlugin)
      .get("/unknown-error", () => {
        throw new Error(secret)
      })

    const response = await app.handle(
      new Request("http://localhost/unknown-error", {
        headers: { "x-request-id": "req_unknown_error" },
      })
    )
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(body).toEqual({
      error: {
        code: "internal_error",
        message: "Internal server error",
        requestId: "req_unknown_error",
      },
    })
    expect(JSON.stringify(body)).not.toContain(secret)
    expect(observability.captureException).toHaveBeenCalledOnce()
  })
})
