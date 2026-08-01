type AuthSessionResult =
  | { data: null; error: { status: number; [key: string]: unknown } }
  | { data: unknown; error: null }

export const readAuthSessionResult = (result: AuthSessionResult) => {
  if (result.error?.status === 401) {
    return null
  }

  if (result.error) {
    throw result.error
  }

  return result.data
}
