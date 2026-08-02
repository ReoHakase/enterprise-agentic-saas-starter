import { Elysia, ValidationError } from "elysia"

import {
  HttpError,
  type HttpErrorCode,
  type HttpFieldErrors,
  httpMessageByErrorCode,
  httpStatusFor,
} from "../../errors/http-error"
import {
  captureObservedException,
  recordObservedHttpStatus,
} from "../observability/runtime"

const isHttpError = (value: unknown): value is HttpError => {
  try {
    return value instanceof HttpError
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

type ErrorProjection = {
  body: {
    error: HttpErrorCode
    fieldErrors?: Record<string, string[]>
    message: string
  }
  capture: { value: unknown } | undefined
  httpStatus: number
  retryAfter: number | undefined
}

const fallbackProjection = (error: unknown): ErrorProjection => ({
  body: {
    error: "internal_error",
    message: httpMessageByErrorCode.internal_error,
  },
  capture: { value: error },
  httpStatus: 500,
  retryAfter: undefined,
})

const fieldSegmentPattern = /^[A-Za-z0-9_-]{1,64}$/
const unsafeFieldNames = new Set(["__proto__", "constructor", "prototype"])

const publicFieldPath = (path: unknown): string | undefined => {
  try {
    if (path === undefined || path === null) return undefined
    const rawSegments = Array.isArray(path) ? path : String(path).split(".")
    if (rawSegments.length === 0 || rawSegments.length > 8) return undefined

    const segments: string[] = []
    for (const item of rawSegments) {
      const key =
        item && typeof item === "object" && "key" in item
          ? Reflect.get(item, "key")
          : item
      const segment = typeof key === "number" ? String(key) : key
      if (
        typeof segment !== "string" ||
        unsafeFieldNames.has(segment) ||
        !fieldSegmentPattern.test(segment)
      ) {
        return undefined
      }
      segments.push(segment)
    }
    return segments[0] && !/^\d+$/.test(segments[0])
      ? segments.join(".")
      : undefined
  } catch {
    return undefined
  }
}

const publicText = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined
  const text = value.trim()
  return text.length > 0 && text.length <= 500 ? text : undefined
}

const publicFieldErrors = (
  value: HttpFieldErrors | undefined
): Record<string, string[]> | undefined => {
  if (!value || typeof value !== "object") return undefined

  const result: Record<string, string[]> = {}
  try {
    for (const [rawField, rawMessages] of Object.entries(value).slice(0, 20)) {
      const field = publicFieldPath(rawField)
      if (!field || !Array.isArray(rawMessages)) continue
      const messages = rawMessages
        .slice(0, 20)
        .map(publicText)
        .filter((message): message is string => message !== undefined)
      if (messages.length > 0) result[field] = messages
    }
  } catch {
    return undefined
  }

  return Object.keys(result).length > 0 ? result : undefined
}

const standardIssues = (error: ValidationError): unknown[] => {
  try {
    const validator = error.validator
    if (!validator || typeof validator !== "object") return []
    const nestedSchema = Reflect.get(validator, "schema")
    const schema =
      "~standard" in validator
        ? validator
        : nestedSchema && typeof nestedSchema === "object"
          ? nestedSchema
          : undefined
    if (!schema || !("~standard" in schema)) return []
    const standard = schema["~standard"]
    if (!standard || typeof standard.validate !== "function") return []
    const result = standard.validate(error.value)
    return result instanceof Promise || !result.issues ? [] : [...result.issues]
  } catch {
    return []
  }
}

const validationFieldErrors = (
  error: ValidationError
): Record<string, string[]> | undefined => {
  const fieldErrors: Record<string, string[]> = {}
  try {
    for (const issue of standardIssues(error).slice(0, 20)) {
      if (!issue || typeof issue !== "object") continue
      const field = publicFieldPath(Reflect.get(issue, "path"))
      if (field && !fieldErrors[field]) fieldErrors[field] = ["Invalid value."]
    }
  } catch {
    return undefined
  }
  return Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined
}

const responseBody = (
  errorCode: HttpErrorCode,
  publicMessage?: unknown,
  fieldErrors?: Record<string, string[]>
): ErrorProjection["body"] => ({
  error: errorCode,
  message: publicText(publicMessage) ?? httpMessageByErrorCode[errorCode],
  ...(fieldErrors ? { fieldErrors } : {}),
})

/** @internal */
export const projectErrorForResponse = (
  code: string,
  error: unknown
): ErrorProjection => {
  try {
    if (isHttpError(error)) {
      const httpStatus = httpStatusFor(error.code)
      return {
        body: responseBody(
          error.code,
          httpStatus < 500 ? error.publicMessage : undefined,
          httpStatus < 500 ? publicFieldErrors(error.fieldErrors) : undefined
        ),
        capture:
          httpStatus >= 500
            ? {
                value: error.cause === undefined ? error : error.cause,
              }
            : undefined,
        httpStatus,
        retryAfter: error.retryAfter,
      }
    }

    if (code === "NOT_FOUND") {
      return {
        body: responseBody("not_found"),
        capture: undefined,
        httpStatus: 404,
        retryAfter: undefined,
      }
    }

    if (
      code === "PARSE" ||
      code === "INVALID_COOKIE_SIGNATURE" ||
      (code === "VALIDATION" && !isResponseValidationError(code, error))
    ) {
      return {
        body: responseBody(
          "validation_error",
          undefined,
          isValidationError(error) ? validationFieldErrors(error) : undefined
        ),
        capture: undefined,
        httpStatus: 400,
        retryAfter: undefined,
      }
    }

    return fallbackProjection(error)
  } catch {
    return fallbackProjection(error)
  }
}

export const errorPlugin = new Elysia({ name: "error" })
  .error({ HttpError })
  .onError(({ code, error, request, route, set }) => {
    const responseRequestId = set.headers["x-request-id"]
    const requestId =
      typeof responseRequestId === "string"
        ? responseRequestId
        : crypto.randomUUID()
    set.headers["x-request-id"] = requestId
    set.headers["cache-control"] = "no-store"

    const projection = projectErrorForResponse(String(code), error)
    if (projection.retryAfter !== undefined) {
      set.headers["retry-after"] = String(projection.retryAfter)
    }

    const errorCode = projection.body.error
    recordObservedHttpStatus(projection.httpStatus, errorCode)
    if (projection.capture !== undefined) {
      captureObservedException(projection.capture.value, {
        errorCode,
        method: request.method,
        requestId,
        route: route || "unmatched",
        statusCode: projection.httpStatus,
      })
    }

    set.status = projection.httpStatus
    return projection.body
  })
  .as("global")
