import type { Breadcrumb, ErrorEvent, Log } from "@sentry/nextjs"

const REDACTED = "[redacted]"
const REDACTED_ID = "[redacted-id]"

const SENSITIVE_KEY_SUFFIXES = [
  "accesstoken",
  "address",
  "apikey",
  "authorization",
  "body",
  "cookie",
  "credential",
  "databaseurl",
  "dburl",
  "email",
  "formdata",
  "headers",
  "invitationid",
  "issueid",
  "memberid",
  "organizationid",
  "password",
  "passwd",
  "phone",
  "privatekey",
  "query",
  "querystring",
  "refreshtoken",
  "secret",
  "sessionid",
  "setcookie",
  "token",
  "userid",
] as const

const DYNAMIC_PATHS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\/organization\/invitations\/[^/?#\s]+/giu, "/invitations/[invitationId]"],
  [/\/organization\/[^/?#\s]+/giu, "/organization/[organizationSlug]"],
  [/\/organizations\/[^/?#\s]+/giu, "/organizations/[organizationId]"],
  [/\/invitations\/[^/?#\s]+/giu, "/invitations/[invitationId]"],
  [/\/members\/[^/?#\s]+/giu, "/members/[memberId]"],
  [/\/issues\/[^/?#\s]+/giu, "/issues/[issueId]"],
  [/\/users\/[^/?#\s]+/giu, "/users/[userId]"],
]

type TransactionEvent = Omit<ErrorEvent, "type"> & { type: "transaction" }
type SentryEvent = ErrorEvent | TransactionEvent

const isSensitiveKey = (key: string): boolean => {
  const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/gu, "")
  return SENSITIVE_KEY_SUFFIXES.some(
    (suffix) => normalized === suffix || normalized.endsWith(suffix)
  )
}

const normalizeDynamicPaths = (value: string): string =>
  DYNAMIC_PATHS.reduce(
    (result, [pattern, replacement]) => result.replaceAll(pattern, replacement),
    value
  )

export const scrubSentryText = (value: string): string =>
  normalizeDynamicPaths(value)
    .replaceAll(/\b(?:Bearer|Basic)\s+[^\s,;]+/giu, REDACTED)
    .replaceAll(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu,
      REDACTED
    )
    .replaceAll(
      /\b(?:libsql|mysql|postgres(?:ql)?|redis):\/\/[^\s]+/giu,
      REDACTED
    )
    .replaceAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, REDACTED)
    .replaceAll(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu,
      REDACTED_ID
    )
    .replaceAll(/\b(https?:\/\/[^\s?#]+)\?[^\s#]*/giu, "$1?[redacted]")

export const scrubSentryUrl = (value: string): string => {
  try {
    const url = new URL(value)
    url.username = ""
    url.password = ""
    url.search = ""
    url.hash = ""
    url.pathname = normalizeDynamicPaths(url.pathname)
    return url.toString()
  } catch {
    return scrubSentryText(value.split(/[?#]/u, 1)[0] ?? value)
  }
}

const scrubValue = (
  value: unknown,
  key = "",
  seen = new WeakSet<object>()
): unknown => {
  if (isSensitiveKey(key)) {
    return REDACTED
  }

  if (typeof value === "string") {
    return scrubSentryText(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, key, seen))
  }

  if (!value || typeof value !== "object") {
    return value
  }

  if (seen.has(value)) {
    return "[circular]"
  }

  seen.add(value)
  for (const [entryKey, entryValue] of Object.entries(value)) {
    Reflect.set(value, entryKey, scrubValue(entryValue, entryKey, seen))
  }

  return value
}

const scrubRecord = <T extends object>(value: T): T => {
  scrubValue(value)
  return value
}

export const scrubSentryBreadcrumb = (
  breadcrumb: Breadcrumb
): Breadcrumb | null => {
  if (breadcrumb.category === "ui.input") {
    return null
  }

  return {
    ...breadcrumb,
    data: breadcrumb.data ? scrubRecord(breadcrumb.data) : undefined,
    message: breadcrumb.message
      ? scrubSentryText(breadcrumb.message)
      : undefined,
  }
}

const scrubSentryEvent = <T extends SentryEvent>(event: T): T => {
  const request = event.request
    ? {
        method: event.request.method,
        url: event.request.url ? scrubSentryUrl(event.request.url) : undefined,
      }
    : undefined

  return {
    ...event,
    breadcrumbs: event.breadcrumbs
      ?.map(scrubSentryBreadcrumb)
      .filter((breadcrumb): breadcrumb is Breadcrumb => breadcrumb !== null),
    contexts: event.contexts ? scrubRecord(event.contexts) : undefined,
    exception: event.exception
      ? {
          values: event.exception.values?.map((exception) => ({
            ...exception,
            mechanism: exception.mechanism
              ? {
                  ...exception.mechanism,
                  data: exception.mechanism.data
                    ? scrubRecord(exception.mechanism.data)
                    : undefined,
                }
              : undefined,
            stacktrace: exception.stacktrace
              ? {
                  ...exception.stacktrace,
                  frames: exception.stacktrace.frames?.map((frame) => ({
                    ...frame,
                    abs_path: frame.abs_path
                      ? scrubSentryUrl(frame.abs_path)
                      : undefined,
                    filename: frame.filename
                      ? scrubSentryUrl(frame.filename)
                      : undefined,
                    module_metadata: frame.module_metadata
                      ? scrubValue(frame.module_metadata)
                      : undefined,
                    vars: undefined,
                  })),
                }
              : undefined,
            value: exception.value
              ? scrubSentryText(exception.value)
              : undefined,
          })),
        }
      : undefined,
    extra: event.extra ? scrubRecord(event.extra) : undefined,
    logentry: event.logentry
      ? {
          message: event.logentry.message
            ? scrubSentryText(event.logentry.message)
            : undefined,
          params: event.logentry.params?.map((param) => scrubValue(param)),
        }
      : undefined,
    message: event.message ? scrubSentryText(event.message) : undefined,
    request,
    spans: event.spans?.map((span) => ({
      ...span,
      data: scrubRecord(span.data),
      description: span.description
        ? scrubSentryText(span.description)
        : undefined,
    })),
    tags: event.tags ? scrubRecord(event.tags) : undefined,
    transaction: event.transaction
      ? scrubSentryText(event.transaction)
      : undefined,
    user: undefined,
  }
}

export const beforeSendSentryError = (event: ErrorEvent): ErrorEvent =>
  scrubSentryEvent(event)

export const beforeSendSentryTransaction = (
  event: TransactionEvent
): TransactionEvent => scrubSentryEvent(event)

export const beforeSendSentryLog = (log: Log): Log => ({
  ...log,
  attributes: log.attributes ? scrubRecord(log.attributes) : undefined,
  message: scrubSentryText(String(log.message)),
})
