export type PublicErrorContext = Record<string, string | number | boolean>
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
  internal(cause: unknown, privateContext: PrivateErrorContext = {}) {
    return new AppError({
      code: "internal_error",
      message: "Internal server error",
      statusCode: 500,
      cause,
      privateContext,
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
