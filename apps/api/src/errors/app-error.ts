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
  code: string
  publicMessage: string
  statusCode: number
  cause?: unknown
  publicContext?: PublicErrorContext
  privateContext?: PrivateErrorContext
}

export class AppError extends Error {
  readonly code: string
  readonly publicMessage: string
  readonly statusCode: number
  readonly publicContext: PublicErrorContext
  readonly privateContext: PrivateErrorContext

  constructor(options: AppErrorOptions) {
    super(options.publicMessage, { cause: options.cause })
    this.name = "AppError"
    this.code = options.code
    this.publicMessage = options.publicMessage
    Object.defineProperty(this, "publicMessage", {
      configurable: false,
      writable: false,
    })
    this.statusCode = options.statusCode
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
      statusCode: 401,
    })
  },
  forbidden(
    publicMessage = "Forbidden",
    publicContext: PublicErrorContext = {}
  ) {
    return new AppError({
      code: "forbidden",
      publicMessage,
      statusCode: 403,
      publicContext,
    })
  },
  csrfOriginForbidden(reason: "missing_origin" | "untrusted_origin") {
    return new AppError({
      code: "csrf_origin_forbidden",
      publicMessage: "Request origin is not allowed",
      statusCode: 403,
      publicContext: { reason },
    })
  },
  conflict(publicMessage = "Conflict", publicContext: PublicErrorContext = {}) {
    return new AppError({
      code: "conflict",
      publicMessage,
      statusCode: 409,
      publicContext,
    })
  },
  activeOrganizationRequired() {
    return new AppError({
      code: "active_organization_required",
      publicMessage: "Select an active organization",
      statusCode: 409,
      publicContext: {
        action: "organization.activate",
        reason: "missing_active_organization",
      },
    })
  },
  activeOrganizationMismatch() {
    return new AppError({
      code: "active_organization_mismatch",
      publicMessage: "Switch to this organization before continuing",
      statusCode: 409,
      publicContext: {
        action: "organization.activate",
        reason: "active_organization_mismatch",
      },
    })
  },
  confirmationRequired(action: string, publicContext: PublicErrorContext = {}) {
    return new AppError({
      code: "confirmation_required",
      publicMessage: "Confirmation does not match",
      statusCode: 400,
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
      publicMessage: "Recent authentication required",
      statusCode: 403,
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
      publicMessage: "Internal server error",
      statusCode: 500,
      cause,
      privateContext,
    })
  },
  unavailable(cause: unknown, retryAfter = 30) {
    return new AppError({
      code: "service_unavailable",
      publicMessage: "Service temporarily unavailable",
      statusCode: 503,
      cause,
      publicContext: { retryAfter },
      privateContext: { operation: "readiness" },
    })
  },
  validation(
    publicMessage = "Invalid request",
    publicContext: PublicErrorContext = {}
  ) {
    return new AppError({
      code: "validation_error",
      publicMessage,
      statusCode: 400,
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
      statusCode: 404,
      publicContext,
    })
  },
}
