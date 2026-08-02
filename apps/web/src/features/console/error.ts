import { FileUploadError } from "@enterprise-agentic-saas/api/client"

export type ConsoleApiFieldErrors = Record<string, string[]>

const fieldPathPattern =
  /^(?!.*(?:^|\.)(?:__proto__|constructor|prototype)(?:\.|$))[A-Za-z0-9_-]{1,64}(?:\.[A-Za-z0-9_-]{1,64}){0,7}$/

const readProperty = (value: unknown, key: string): unknown => {
  if (
    (typeof value !== "object" || value === null) &&
    typeof value !== "function"
  ) {
    return undefined
  }
  try {
    return Reflect.get(value, key)
  } catch {
    return undefined
  }
}

const publicText = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined
  const text = value.trim()
  return text.length > 0 && text.length <= 500 ? text : undefined
}

const getHttpErrorValue = (error: unknown) => readProperty(error, "value")

const isFileUploadError = (error: unknown): error is FileUploadError => {
  try {
    return error instanceof FileUploadError
  } catch {
    return false
  }
}

const getHttpErrorMessage = (error: unknown) =>
  publicText(readProperty(getHttpErrorValue(error), "message")) ??
  (isFileUploadError(error)
    ? publicText(readProperty(error, "message"))
    : undefined)

const readFieldErrors = (value: unknown): ConsoleApiFieldErrors => {
  if (typeof value !== "object" || value === null) return {}

  const fieldErrors: ConsoleApiFieldErrors = {}
  try {
    for (const [field, rawMessages] of Object.entries(value).slice(0, 20)) {
      if (!fieldPathPattern.test(field) || !Array.isArray(rawMessages)) continue
      const messages = rawMessages
        .slice(0, 20)
        .map(publicText)
        .filter((message): message is string => message !== undefined)
      if (messages.length > 0) fieldErrors[field] = messages
    }
  } catch {
    return {}
  }
  return fieldErrors
}

const getHttpErrorStatus = (error: unknown): number | undefined => {
  const status = readProperty(error, "status")
  return typeof status === "number" ? status : undefined
}

const getHttpErrorCode = (error: unknown): string | undefined => {
  const value = getHttpErrorValue(error)
  const envelopeCode = readProperty(value, "error")
  if (typeof envelopeCode === "string") return envelopeCode

  const directCode = readProperty(error, "code")
  return typeof directCode === "string" ? directCode : undefined
}

export const isHttpErrorStatus = (error: unknown, status: number) =>
  getHttpErrorStatus(error) === status

export const isStepUpRequiredError = (error: unknown) =>
  getHttpErrorCode(error) === "step_up_required"

export type ConsoleApiErrorPresentation = {
  description?: string
  fieldErrors: ConsoleApiFieldErrors
  message: string
}

export const presentConsoleApiError = (
  error: unknown,
  fallback: string
): ConsoleApiErrorPresentation => {
  const status = getHttpErrorStatus(error)
  const canPresentPublicDetail = status !== undefined && status < 500
  return {
    description:
      (status ?? 0) >= 500
        ? "Try again. If the problem continues, contact support."
        : undefined,
    fieldErrors: canPresentPublicDetail
      ? readFieldErrors(readProperty(getHttpErrorValue(error), "fieldErrors"))
      : {},
    message:
      (canPresentPublicDetail ? getHttpErrorMessage(error) : undefined) ??
      fallback,
  }
}

export const getConsoleApiErrorText = (error: unknown, fallback: string) => {
  const { description, message } = presentConsoleApiError(error, fallback)
  return [message, description].filter(Boolean).join(" ")
}

export const getConsoleApiFieldError = (error: unknown, field: string) =>
  getConsoleApiFieldErrors(error)[field]?.[0]

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
  const status = getHttpErrorStatus(error)
  return status === undefined || status >= 500
}
