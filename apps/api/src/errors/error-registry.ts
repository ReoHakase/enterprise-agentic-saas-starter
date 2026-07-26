export const appErrorCodes = [
  "unauthorized",
  "forbidden",
  "csrf_origin_forbidden",
  "conflict",
  "active_organization_required",
  "active_organization_mismatch",
  "confirmation_required",
  "step_up_required",
  "internal_error",
  "service_unavailable",
  "rate_limited",
  "validation_error",
  "not_found",
  "unsupported_media_type",
] as const

export type AppErrorCode = (typeof appErrorCodes)[number]

/** @internal */
export const errorRegistry = {
  unauthorized: {
    statusCode: 401,
    publicMessage: "Authentication required",
    capture: false,
    retryable: false,
  },
  forbidden: {
    statusCode: 403,
    publicMessage: "Forbidden",
    capture: false,
    retryable: false,
  },
  csrf_origin_forbidden: {
    statusCode: 403,
    publicMessage: "Request origin is not allowed",
    capture: false,
    retryable: false,
  },
  conflict: {
    statusCode: 409,
    publicMessage: "Conflict",
    capture: false,
    retryable: false,
  },
  active_organization_required: {
    statusCode: 409,
    publicMessage: "Select an active organization",
    capture: false,
    retryable: false,
  },
  active_organization_mismatch: {
    statusCode: 409,
    publicMessage: "Switch to this organization before continuing",
    capture: false,
    retryable: false,
  },
  confirmation_required: {
    statusCode: 400,
    publicMessage: "Confirmation does not match",
    capture: false,
    retryable: false,
  },
  step_up_required: {
    statusCode: 403,
    publicMessage: "Recent authentication required",
    capture: false,
    retryable: false,
  },
  internal_error: {
    statusCode: 500,
    publicMessage: "Internal server error",
    capture: true,
    retryable: false,
  },
  service_unavailable: {
    statusCode: 503,
    publicMessage: "Service temporarily unavailable",
    capture: true,
    retryable: true,
  },
  rate_limited: {
    statusCode: 429,
    publicMessage: "Too many requests. Try again later",
    capture: false,
    retryable: true,
  },
  validation_error: {
    statusCode: 400,
    publicMessage: "Invalid request",
    capture: false,
    retryable: false,
  },
  not_found: {
    statusCode: 404,
    publicMessage: "Not found",
    capture: false,
    retryable: false,
  },
  unsupported_media_type: {
    statusCode: 415,
    publicMessage: "Unsupported media type",
    capture: false,
    retryable: false,
  },
} as const satisfies Record<
  AppErrorCode,
  {
    capture: boolean
    publicMessage: string
    retryable: boolean
    statusCode: number
  }
>

export const errorDefinition = (code: AppErrorCode) => errorRegistry[code]
