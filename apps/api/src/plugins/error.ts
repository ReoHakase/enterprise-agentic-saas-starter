import { Elysia } from "elysia"

import { AppError } from "../errors/app-error"
import {
  captureObservedException,
  recordObservedHttpStatus,
} from "../observability/runtime"

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

const recordError = (
  httpStatus: number,
  elysiaCode: string,
  error: unknown,
  request: Request,
  requestId: string | null,
  route: string
) => {
  const appCode = attributeCodeFor(elysiaCode, error)
  recordObservedHttpStatus(httpStatus, appCode)

  if (httpStatus >= 500 && requestId) {
    captureObservedException(error, {
      errorCode: appCode,
      method: request.method,
      requestId,
      route: route || "unmatched",
      statusCode: httpStatus,
    })
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
  .onError(({ code, error, request, route, set }) => {
    const responseRequestId = set.headers["x-request-id"]
    const requestId =
      typeof responseRequestId === "string"
        ? responseRequestId
        : crypto.randomUUID()
    set.headers["x-request-id"] = requestId

    const errorCode = String(code)
    const httpStatus = statusCodeFor(errorCode, error)

    recordError(httpStatus, errorCode, error, request, requestId, route)

    set.status = httpStatus

    return responseBody(errorCode, error, requestId)
  })
  .as("global")
