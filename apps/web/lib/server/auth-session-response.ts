export class AuthSessionRequestError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Session request failed with status ${status}`)
    this.name = "AuthSessionRequestError"
    this.status = status
  }
}

type AuthSessionResult =
  | { data: null; error: { status: number } }
  | { data: unknown; error: null }

export const readAuthSessionResult = (result: AuthSessionResult) => {
  if (result.error?.status === 401) {
    return null
  }

  if (result.error) {
    throw new AuthSessionRequestError(result.error.status)
  }

  return result.data
}
