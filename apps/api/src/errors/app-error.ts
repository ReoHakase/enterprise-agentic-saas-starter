import { errorDefinition, type AppErrorCode } from "./error-registry"

export type PublicErrorContext = Partial<{
  action: string
  constraint: string
  field: string
  maxAgeSeconds: number
  reason: string
  resource: string
  retryAfter: number
}>
export type PrivateErrorContext = Record<string, unknown>

const publicStringContextKeys = [
  "action",
  "constraint",
  "field",
  "reason",
  "resource",
] as const
const publicNumberContextKeys = ["maxAgeSeconds", "retryAfter"] as const
const publicContextIdentifierPattern = /^[A-Za-z][A-Za-z0-9_.:-]{0,95}$/

const ownValue = (value: object, key: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  return descriptor && "value" in descriptor ? descriptor.value : undefined
}

/**
 * AppErrorの型を迂回した値もHTTP responseへ出る直前に安全な契約へ絞る。
 * free-text、URL、email、token、tenant IDをcontextへ載せる用途には使わない。
 */
export const sanitizePublicErrorContext = (
  value: unknown
): PublicErrorContext => {
  if (!value || typeof value !== "object") {
    return {}
  }

  const output: PublicErrorContext = {}
  for (const key of publicStringContextKeys) {
    const contextValue = ownValue(value, key)
    if (
      typeof contextValue === "string" &&
      publicContextIdentifierPattern.test(contextValue)
    ) {
      output[key] = contextValue
    }
  }
  for (const key of publicNumberContextKeys) {
    const contextValue = ownValue(value, key)
    if (
      typeof contextValue === "number" &&
      Number.isSafeInteger(contextValue) &&
      contextValue >= 0
    ) {
      output[key] = contextValue
    }
  }

  return output
}

export type AppErrorOptions = {
  code: AppErrorCode
  publicMessage?: string
  cause?: unknown
  publicContext?: PublicErrorContext
  privateContext?: PrivateErrorContext
}

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly publicMessage: string
  readonly statusCode: number
  readonly publicContext: PublicErrorContext
  readonly privateContext: PrivateErrorContext

  constructor(options: AppErrorOptions) {
    const definition = errorDefinition(options.code)
    const publicMessage = options.publicMessage ?? definition.publicMessage
    super(publicMessage, { cause: options.cause })
    this.name = "AppError"
    this.code = options.code
    this.publicMessage = publicMessage
    Object.defineProperty(this, "publicMessage", {
      configurable: false,
      writable: false,
    })
    this.statusCode = definition.statusCode
    this.publicContext = Object.freeze(
      sanitizePublicErrorContext(options.publicContext)
    )
    this.privateContext = options.privateContext ?? {}
  }
}

export const publicErrors = {
  unauthorized(publicMessage = "Authentication required") {
    return new AppError({
      code: "unauthorized",
      publicMessage,
    })
  },
  forbidden(
    publicMessage = "Forbidden",
    publicContext: PublicErrorContext = {}
  ) {
    return new AppError({
      code: "forbidden",
      publicMessage,
      publicContext,
    })
  },
  csrfOriginForbidden(reason: "missing_origin" | "untrusted_origin") {
    return new AppError({
      code: "csrf_origin_forbidden",
      publicContext: { reason },
    })
  },
  conflict(publicMessage = "Conflict", publicContext: PublicErrorContext = {}) {
    return new AppError({
      code: "conflict",
      publicMessage,
      publicContext,
    })
  },
  activeOrganizationRequired() {
    return new AppError({
      code: "active_organization_required",
      publicContext: {
        action: "organization.activate",
        reason: "missing_active_organization",
      },
    })
  },
  activeOrganizationMismatch() {
    return new AppError({
      code: "active_organization_mismatch",
      publicContext: {
        action: "organization.activate",
        reason: "active_organization_mismatch",
      },
    })
  },
  confirmationRequired(action: string, publicContext: PublicErrorContext = {}) {
    return new AppError({
      code: "confirmation_required",
      publicContext: {
        action,
        field: "confirmation",
        reason: "mismatch",
        ...publicContext,
      },
    })
  },
  stepUpRequired(action: string, maxAgeSeconds: number) {
    return new AppError({
      code: "step_up_required",
      publicContext: {
        action,
        maxAgeSeconds,
        reason: "session_not_fresh",
      },
    })
  },
  internal(cause: unknown, privateContext: PrivateErrorContext = {}) {
    return new AppError({
      code: "internal_error",
      cause,
      privateContext,
    })
  },
  unavailable(cause: unknown, retryAfter = 30) {
    return new AppError({
      code: "service_unavailable",
      cause,
      publicContext: { retryAfter },
      privateContext: { operation: "readiness" },
    })
  },
  rateLimited(retryAfter: number) {
    return new AppError({
      code: "rate_limited",
      publicMessage: "Too many invitations requested. Try again later",
      publicContext: {
        reason: "quota_exceeded",
        resource: "invitation",
        retryAfter,
      },
    })
  },
  validation(
    publicMessage = "Invalid request",
    publicContext: PublicErrorContext = {}
  ) {
    return new AppError({
      code: "validation_error",
      publicMessage,
      publicContext,
    })
  },
  notFound(
    publicMessage = "Not found",
    publicContext: PublicErrorContext = {}
  ) {
    return new AppError({
      code: "not_found",
      publicMessage,
      publicContext,
    })
  },
}
