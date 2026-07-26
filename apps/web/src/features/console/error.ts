import * as v from "valibot"

const publicTextSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(500)
)
const errorCodeSchema = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{1,64}$/u))
const requestIdSchema = v.pipe(
  v.string(),
  v.regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u)
)
const fieldPathSchema = v.pipe(
  v.string(),
  v.regex(
    /^(?!.*(?:^|\.)(?:__proto__|constructor|prototype)(?:\.|$))[A-Za-z0-9_-]{1,64}(?:\.[A-Za-z0-9_-]{1,64}){0,7}$/u
  )
)
const contextTextSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(96),
  v.regex(/^[A-Za-z][A-Za-z0-9_.:-]*$/u)
)
const contextNumberSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(Number.MAX_SAFE_INTEGER)
)
const publicContextValueSchema = v.union([
  contextTextSchema,
  contextNumberSchema,
])
const errorEnvelopeSchema = v.object({
  error: v.object({
    code: v.optional(v.unknown()),
    context: v.optional(v.unknown()),
    fieldErrors: v.optional(v.unknown()),
    message: v.optional(v.unknown()),
    requestId: v.optional(v.unknown()),
  }),
})

const contextKeys = [
  "action",
  "constraint",
  "field",
  "maxAgeSeconds",
  "reason",
  "resource",
  "retryAfter",
] as const
const actionFallbackCodes = new Set([
  "internal_error",
  "invalid_response",
  "request_failed",
])

type ConsoleApiErrorContextKey = (typeof contextKeys)[number]
type ConsoleApiErrorContextValue = v.InferOutput<
  typeof publicContextValueSchema
>

export type ConsoleApiErrorContext = Partial<
  Record<ConsoleApiErrorContextKey, ConsoleApiErrorContextValue>
>
export type ConsoleApiFieldErrors = Record<string, string[]>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const parseCode = (value: unknown) => {
  const result = v.safeParse(errorCodeSchema, value)
  return result.success ? result.output : undefined
}

const parsePublicText = (value: unknown) => {
  const result = v.safeParse(publicTextSchema, value)
  return result.success ? result.output : undefined
}

const parseRequestId = (value: unknown) => {
  if (value === null || value === undefined) return undefined
  const result = v.safeParse(requestIdSchema, value)
  return result.success ? result.output : undefined
}

const parseContext = (value: unknown): ConsoleApiErrorContext => {
  if (!isRecord(value)) return {}

  const context: ConsoleApiErrorContext = {}
  for (const key of contextKeys) {
    const result = v.safeParse(publicContextValueSchema, value[key])
    if (result.success) context[key] = result.output
  }
  return context
}

const parseFieldErrors = (value: unknown): ConsoleApiFieldErrors => {
  if (!isRecord(value)) return {}

  const fieldErrors: ConsoleApiFieldErrors = {}
  for (const [field, messages] of Object.entries(value)) {
    const fieldResult = v.safeParse(fieldPathSchema, field)
    if (!fieldResult.success || !Array.isArray(messages)) continue

    const safeMessages = messages
      .slice(0, 20)
      .map(parsePublicText)
      .filter((message): message is string => message !== undefined)
    if (safeMessages.length > 0) fieldErrors[fieldResult.output] = safeMessages
  }
  return fieldErrors
}

const apiErrorPayload = (error: unknown) => {
  const value = isRecord(error) && "value" in error ? error.value : error
  const result = v.safeParse(errorEnvelopeSchema, value)
  if (!result.success) return undefined

  return {
    code: parseCode(result.output.error.code),
    context: parseContext(result.output.error.context),
    fieldErrors: parseFieldErrors(result.output.error.fieldErrors),
    message: parsePublicText(result.output.error.message),
    requestId: parseRequestId(result.output.error.requestId),
  }
}

export class ConsoleApiError extends Error {
  readonly code: string
  readonly context: ConsoleApiErrorContext
  readonly fieldErrors: ConsoleApiFieldErrors
  readonly requestId?: string
  readonly status: number

  constructor({
    code,
    context,
    fieldErrors,
    message,
    requestId,
    status,
  }: {
    code: string
    context?: ConsoleApiErrorContext
    fieldErrors?: ConsoleApiFieldErrors
    message: string
    requestId?: string
    status: number
  }) {
    super(message)
    this.name = "ConsoleApiError"
    this.code = code
    this.context = context ?? {}
    this.fieldErrors = fieldErrors ?? {}
    this.requestId = requestId
    this.status = status
  }
}

export const isStepUpRequiredError = (
  error: unknown
): error is ConsoleApiError =>
  error instanceof ConsoleApiError && error.code === "step_up_required"

export const toConsoleApiError = (error: unknown, status: number) => {
  const payload = apiErrorPayload(error)
  return new ConsoleApiError({
    code: payload?.code ?? "request_failed",
    context: payload?.context,
    fieldErrors: payload?.fieldErrors,
    message: payload?.message ?? "Request failed",
    requestId: payload?.requestId,
    status,
  })
}

export type ConsoleApiErrorPresentation = {
  description?: string
  fieldErrors: ConsoleApiFieldErrors
  message: string
  requestId?: string
}

const retryDescription = (retryAfter: unknown) => {
  if (typeof retryAfter !== "number" || retryAfter <= 0) return undefined
  const seconds = Math.ceil(retryAfter)
  return `Try again in ${seconds} ${seconds === 1 ? "second" : "seconds"}.`
}

export const presentConsoleApiError = (
  error: unknown,
  fallback: string
): ConsoleApiErrorPresentation => {
  if (!(error instanceof ConsoleApiError)) {
    return {
      description: "Check your connection and try again.",
      fieldErrors: {},
      message: fallback,
    }
  }

  const useActionFallback = actionFallbackCodes.has(error.code)
  const retry = retryDescription(error.context.retryAfter)
  const recovery =
    error.status >= 500 && !retry
      ? "Try again. If the problem continues, contact support."
      : undefined
  const reference =
    error.status >= 500 && error.requestId
      ? `Reference ID: ${error.requestId}`
      : undefined
  return {
    description:
      [retry, recovery, reference].filter(Boolean).join(" ") || undefined,
    fieldErrors: error.fieldErrors,
    message: useActionFallback ? fallback : error.message,
    requestId: error.requestId,
  }
}

export const getConsoleApiErrorText = (error: unknown, fallback: string) => {
  const { description, message } = presentConsoleApiError(error, fallback)
  return [message, description].filter(Boolean).join(" ")
}

export const getConsoleApiFieldError = (error: unknown, field: string) =>
  presentConsoleApiError(error, "Request failed").fieldErrors[field]?.[0]

export const getConsoleApiFieldErrors = (error: unknown) =>
  presentConsoleApiError(error, "Request failed").fieldErrors

export const clearConsoleApiFieldError = (
  fieldErrors: ConsoleApiFieldErrors,
  field: string
) => {
  if (!(field in fieldErrors)) return fieldErrors

  const nextFieldErrors = { ...fieldErrors }
  delete nextFieldErrors[field]
  return nextFieldErrors
}

export const hasConsoleApiFieldError = (
  fieldErrors: ConsoleApiFieldErrors,
  fields: readonly string[]
) => fields.some((field) => Boolean(fieldErrors[field]?.length))

export const shouldRetryConsoleQuery = (
  failureCount: number,
  error: unknown
) => {
  if (failureCount >= 1) return false
  return !(error instanceof ConsoleApiError) || error.status >= 500
}
