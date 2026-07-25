import { Elysia, ValidationError } from "elysia"

import { AppError, sanitizePublicErrorContext } from "../errors/app-error"
import { errorDefinition } from "../errors/error-registry"
import {
  captureObservedException,
  recordObservedHttpStatus,
} from "../observability/runtime"

const isAppError = (value: unknown): value is AppError => {
  try {
    return value instanceof AppError
  } catch {
    return false
  }
}

const isValidationError = (value: unknown): value is ValidationError => {
  try {
    return value instanceof ValidationError
  } catch {
    return false
  }
}

const isResponseValidationError = (code: string, error: unknown) =>
  code === "VALIDATION" && isValidationError(error) && error.type === "response"

const statusCodeFor = (code: string, error: unknown) => {
  if (isAppError(error)) {
    return error.statusCode
  }

  if (code === "NOT_FOUND") {
    return 404
  }

  if (isResponseValidationError(code, error)) {
    return 500
  }

  if (code === "VALIDATION") {
    return 400
  }

  return 500
}

const attributeCodeFor = (elysiaCode: string, error: unknown): string => {
  if (isAppError(error)) {
    return error.code
  }

  if (elysiaCode === "NOT_FOUND") {
    return "not_found"
  }

  if (isResponseValidationError(elysiaCode, error)) {
    return "internal_error"
  }

  if (elysiaCode === "VALIDATION") {
    return "validation_error"
  }

  return "internal_error"
}

type FieldErrors = Record<string, string[]>

const unsafeFieldNames = new Set(["__proto__", "constructor", "prototype"])
const fieldSegmentPattern = /^[A-Za-z0-9_-]{1,64}$/

const fieldPathFrom = (path: unknown): string | null => {
  if (!Array.isArray(path) || path.length === 0 || path.length > 8) {
    return null
  }

  const segments: string[] = []
  for (const item of path) {
    const key =
      item && typeof item === "object" && "key" in item
        ? Reflect.get(item, "key")
        : item
    if (typeof key !== "string" && typeof key !== "number") {
      return null
    }
    const segment = String(key)
    if (unsafeFieldNames.has(segment) || !fieldSegmentPattern.test(segment)) {
      return null
    }
    segments.push(segment)
  }

  return typeof segments[0] === "string" && !/^\d+$/.test(segments[0])
    ? segments.join(".")
    : null
}

const standardIssuesFrom = (error: ValidationError): unknown[] => {
  const validator = error.validator
  if (!validator || typeof validator !== "object") {
    return []
  }

  const nestedSchema = Reflect.get(validator, "schema")
  const schema =
    "~standard" in validator
      ? validator
      : nestedSchema && typeof nestedSchema === "object"
        ? nestedSchema
        : null
  if (!schema || !("~standard" in schema)) {
    return []
  }

  const standard = schema["~standard"]
  if (!standard || typeof standard.validate !== "function") {
    return []
  }

  try {
    const result = standard.validate(error.value)
    if (result instanceof Promise || !result.issues) {
      return []
    }
    return [...result.issues]
  } catch {
    return []
  }
}

const fieldErrorsFor = (
  code: string,
  error: unknown
): FieldErrors | undefined => {
  if (isAppError(error)) {
    const field = error.publicContext.field
    if (typeof field !== "string") {
      return undefined
    }
    const safeField = fieldPathFrom([field])
    return safeField ? { [safeField]: [error.publicMessage] } : undefined
  }

  if (
    code !== "VALIDATION" ||
    !isValidationError(error) ||
    error.type === "response"
  ) {
    return undefined
  }

  const fieldErrors: FieldErrors = {}
  for (const issue of standardIssuesFrom(error).slice(0, 20)) {
    if (!issue || typeof issue !== "object") {
      continue
    }
    const field = fieldPathFrom(Reflect.get(issue, "path"))
    if (field && !fieldErrors[field]) {
      fieldErrors[field] = ["Invalid value"]
    }
  }

  return Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined
}

const recordError = (
  httpStatus: number,
  elysiaCode: string,
  error: unknown,
  request: Request,
  requestId: string,
  route: string
) => {
  const appCode = attributeCodeFor(elysiaCode, error)
  recordObservedHttpStatus(httpStatus, appCode)

  const shouldCapture = isAppError(error)
    ? errorDefinition(error.code).capture
    : httpStatus >= 500
  if (shouldCapture && requestId) {
    captureObservedException(error, {
      errorCode: appCode,
      method: request.method,
      requestId,
      route: route || "unmatched",
      statusCode: httpStatus,
    })
  }
}

const responseBody = (code: string, error: unknown, requestId: string) => {
  const fieldErrors = fieldErrorsFor(code, error)

  if (isResponseValidationError(code, error)) {
    return {
      error: {
        code: "internal_error",
        message: "Internal server error",
        requestId,
      },
    }
  }

  if (isAppError(error)) {
    const context = sanitizePublicErrorContext(error.publicContext)
    return {
      error: {
        code: error.code,
        message: error.publicMessage,
        ...(Object.keys(context).length > 0 ? { context } : {}),
        ...(fieldErrors ? { fieldErrors } : {}),
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
        ...(fieldErrors ? { fieldErrors } : {}),
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

const internalErrorBody = (requestId: string) => ({
  error: {
    code: "internal_error",
    message: "Internal server error",
    requestId,
  },
})

/** @internal */
export const projectErrorForResponse = (
  code: string,
  error: unknown,
  requestId: string
) => {
  let httpStatus = 500
  let body = internalErrorBody(requestId)
  let retryAfter: number | undefined

  try {
    httpStatus = statusCodeFor(code, error)
    body = responseBody(code, error, requestId)

    if (isAppError(error)) {
      const definition = errorDefinition(error.code)
      if (
        definition.retryable &&
        typeof error.publicContext.retryAfter === "number"
      ) {
        retryAfter = error.publicContext.retryAfter
      }
    }
  } catch {
    httpStatus = 500
    body = internalErrorBody(requestId)
  }

  return { body, httpStatus, retryAfter }
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
    const { body, httpStatus, retryAfter } = projectErrorForResponse(
      errorCode,
      error,
      requestId
    )

    set.headers["cache-control"] = "no-store"

    if (retryAfter !== undefined) {
      set.headers["retry-after"] = String(retryAfter)
    }

    try {
      recordError(httpStatus, errorCode, error, request, requestId, route)
    } catch {
      recordObservedHttpStatus(500, "internal_error")
      captureObservedException(error, {
        errorCode: "internal_error",
        method: request.method,
        requestId,
        route: route || "unmatched",
        statusCode: 500,
      })
    }

    set.status = httpStatus

    return body
  })
  .as("global")
