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

import { errorPlugin } from "./error"
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
})
