export const httpErrorCodes = [
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

export type HttpErrorCode = (typeof httpErrorCodes)[number]

export type HttpFieldErrors = Readonly<Record<string, readonly string[]>>

const httpStatusByErrorCode = {
  active_organization_mismatch: 409,
  active_organization_required: 409,
  confirmation_required: 400,
  conflict: 409,
  csrf_origin_forbidden: 403,
  forbidden: 403,
  internal_error: 500,
  not_found: 404,
  rate_limited: 429,
  service_unavailable: 503,
  step_up_required: 403,
  unauthorized: 401,
  unsupported_media_type: 415,
  validation_error: 400,
} as const satisfies Record<HttpErrorCode, number>

export const httpMessageByErrorCode = {
  active_organization_mismatch:
    "Switch to this organization before continuing.",
  active_organization_required: "Select an active organization.",
  confirmation_required: "Confirmation does not match.",
  conflict: "The request conflicts with the current state.",
  csrf_origin_forbidden: "The request origin is not allowed.",
  forbidden: "You do not have permission to perform this action.",
  internal_error: "An unexpected error occurred.",
  not_found: "The requested resource was not found.",
  rate_limited: "Too many requests. Try again later.",
  service_unavailable: "The service is temporarily unavailable.",
  step_up_required: "Recent authentication is required.",
  unauthorized: "Authentication is required.",
  unsupported_media_type: "The media type is not supported.",
  validation_error: "The request is invalid.",
} as const satisfies Record<HttpErrorCode, string>

export const httpStatusFor = (code: HttpErrorCode): number =>
  httpStatusByErrorCode[code]

export type HttpErrorOptions = {
  code: HttpErrorCode
  cause?: unknown
  fieldErrors?: HttpFieldErrors
  publicMessage?: string
  retryAfter?: number
}

export class HttpError extends Error {
  readonly code: HttpErrorCode
  readonly fieldErrors?: HttpFieldErrors
  readonly publicMessage?: string
  readonly retryAfter?: number

  constructor(options: HttpErrorOptions) {
    super(options.code, { cause: options.cause })
    this.name = "HttpError"
    this.code = options.code
    this.fieldErrors = options.fieldErrors
    this.publicMessage = options.publicMessage
    if (
      typeof options.retryAfter === "number" &&
      Number.isSafeInteger(options.retryAfter) &&
      options.retryAfter >= 0
    ) {
      this.retryAfter = options.retryAfter
    }
  }
}
