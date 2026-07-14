export type PublicErrorContext = Partial<
  Record<
    | "action"
    | "constraint"
    | "field"
    | "maxAgeSeconds"
    | "reason"
    | "resource"
    | "retryAfter",
    string | number | boolean
  >
>
export type PrivateErrorContext = Record<string, unknown>

export type AppErrorOptions = {
  code: string
  message: string
  statusCode: number
  cause?: unknown
  publicContext?: PublicErrorContext
  privateContext?: PrivateErrorContext
}

export class AppError extends Error {
  readonly code: string
  readonly statusCode: number
  readonly publicContext: PublicErrorContext
  readonly privateContext: PrivateErrorContext

  constructor(options: AppErrorOptions) {
    super(options.message, { cause: options.cause })
    this.name = "AppError"
    this.code = options.code
    this.statusCode = options.statusCode
    this.publicContext = options.publicContext ?? {}
    this.privateContext = options.privateContext ?? {}
  }
}

export const publicErrors = {
  unauthorized(message = "Authentication required") {
    return new AppError({
      code: "unauthorized",
      message,
      statusCode: 401,
    })
  },
  forbidden(message = "Forbidden", publicContext: PublicErrorContext = {}) {
    return new AppError({
      code: "forbidden",
      message,
      statusCode: 403,
      publicContext,
    })
  },
  csrfOriginForbidden(reason: "missing_origin" | "untrusted_origin") {
    return new AppError({
      code: "csrf_origin_forbidden",
      message: "Request origin is not allowed",
      statusCode: 403,
      publicContext: { reason },
    })
  },
  conflict(message = "Conflict", publicContext: PublicErrorContext = {}) {
    return new AppError({
      code: "conflict",
      message,
      statusCode: 409,
      publicContext,
    })
  },
  activeOrganizationRequired() {
    return new AppError({
      code: "active_organization_required",
      message: "Select an active organization",
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
      message: "Switch to this organization before continuing",
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
      message: "Confirmation does not match",
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
      message: "Recent authentication required",
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
      message: "Internal server error",
      statusCode: 500,
      cause,
      privateContext,
    })
  },
  unavailable(cause: unknown, retryAfter = 30) {
    return new AppError({
      code: "service_unavailable",
      message: "Service temporarily unavailable",
      statusCode: 503,
      cause,
      publicContext: { retryAfter },
      privateContext: { operation: "readiness" },
    })
  },
  validation(
    message = "Invalid request",
    publicContext: PublicErrorContext = {}
  ) {
    return new AppError({
      code: "validation_error",
      message,
      statusCode: 400,
      publicContext,
    })
  },
  notFound(message = "Not found", publicContext: PublicErrorContext = {}) {
    return new AppError({
      code: "not_found",
      message,
      statusCode: 404,
      publicContext,
    })
  },
}
