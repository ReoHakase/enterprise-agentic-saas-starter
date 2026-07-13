export class AuthSessionRequestError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Session request failed with status ${status}`)
    this.name = "AuthSessionRequestError"
    this.status = status
  }
}

export const readAuthSessionResponse = async (response: Response) => {
  if (response.status === 401) {
    return null
  }

  if (!response.ok) {
    throw new AuthSessionRequestError(response.status)
  }

  const payload: unknown = await response.json()
  return payload
}
