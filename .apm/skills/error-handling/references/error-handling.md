# Error Handling Reference

## AppError

```ts
export type PublicErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL_SERVER_ERROR"

export class AppError extends Error {
  readonly name = "AppError"

  constructor(
    readonly code: PublicErrorCode,
    readonly status: number,
    readonly publicMessage: string,
    options?: {
      publicContext?: Record<string, string>
      privateContext?: unknown
      cause?: unknown
    }
  ) {
    super(publicMessage, { cause: options?.cause })
    this.publicContext = options?.publicContext
    this.privateContext = options?.privateContext
  }

  readonly publicContext?: Record<string, string>
  readonly privateContext?: unknown
}
```

## response変換

```ts
export function toHttpError(error: unknown) {
  if (error instanceof AppError) {
    return {
      status: error.status,
      code: error.code,
      message: error.publicMessage,
      context: sanitizePublicContext(error.publicContext),
    }
  }

  return {
    status: 500,
    code: "INTERNAL_SERVER_ERROR",
    message: "Internal server error",
  }
}
```

## redaction対象

key:

```txt
password, passwd, secret, token, access_token, refresh_token,
authorization, cookie, set-cookie, api_key, private_key,
credential, database_url, dsn
```

value:

```txt
Bearer ...
Basic ...
postgres://...
mysql://...
mongodb://...
libsql://... token-like query
```

## onError確認

- validation errorを400へ丸める。
- AppErrorをsafe responseへ変換する。
- unknown errorを500へ丸める。
- request idを必ず含める。
- logとOpenTelemetryにはredacted errorだけを渡す。
