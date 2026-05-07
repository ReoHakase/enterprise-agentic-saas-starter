import { SpanStatusCode, trace } from "@opentelemetry/api"
import { Elysia } from "elysia"

import { AppError } from "../errors/app-error"

const statusCodeFor = (code: string, error: unknown) => {
  if (error instanceof AppError) {
    return error.statusCode
  }

  if (code === "NOT_FOUND") {
    return 404
  }

  if (code === "VALIDATION") {
    return 400
  }

  return 500
}

const attributeCodeFor = (elysiaCode: string, error: unknown): string => {
  if (error instanceof AppError) {
    return error.code
  }

  if (elysiaCode === "NOT_FOUND") {
    return "not_found"
  }

  if (elysiaCode === "VALIDATION") {
    return "validation_error"
  }

  return "internal_error"
}

const recordSpan = (httpStatus: number, elysiaCode: string, error: unknown) => {
  const span = trace.getActiveSpan()
  if (!span) {
    return
  }

  span.setAttribute("http.response.status_code", httpStatus)

  const appCode = attributeCodeFor(elysiaCode, error)
  span.setAttribute("app.error.code", appCode)

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.code,
      })
      span.recordException(error)
    }
    return
  }

  if (httpStatus >= 500) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: "internal_error",
    })
    span.recordException(new Error("internal_error"))
  }
}

const responseBody = (
  code: string,
  error: unknown,
  requestId: string | null
) => {
  if (error instanceof AppError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        context: error.publicContext,
        requestId,
      },
    }
  }

  if (code === "NOT_FOUND") {
    return {
      error: {
        code: "not_found",
        message: "Not found",
        requestId,
      },
    }
  }

  if (code === "VALIDATION") {
    return {
      error: {
        code: "validation_error",
        message: "Invalid request",
        requestId,
      },
    }
  }

  return {
    error: {
      code: "internal_error",
      message: "Internal server error",
      requestId,
    },
  }
}

export const errorPlugin = new Elysia({ name: "error" })
  .onError(({ code, error, request, set }) => {
    const requestId =
      request.headers.get("x-request-id") ?? set.headers["x-request-id"] ?? null

    const errorCode = String(code)
    const httpStatus = statusCodeFor(errorCode, error)

    recordSpan(httpStatus, errorCode, error)

    set.status = httpStatus

    return responseBody(errorCode, error, requestId)
  })
  .as("global")
