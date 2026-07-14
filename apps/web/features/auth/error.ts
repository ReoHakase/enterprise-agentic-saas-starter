const publicErrorMessages: Readonly<Record<string, string>> = {
  EMAIL_NOT_VERIFIED: "Verify your email address before signing in.",
  INVALID_EMAIL_OR_PASSWORD: "The email or password is incorrect.",
  INVALID_PASSWORD: "The email or password is incorrect.",
  USER_ALREADY_EXISTS: "An account already exists for this email address.",
  USER_NOT_FOUND: "We could not complete that request.",
}

const errorCode = (error: unknown) => {
  if (typeof error !== "object" || error === null) return undefined
  const nested = Reflect.get(error, "error")
  if (typeof nested !== "object" || nested === null) return undefined
  const code = Reflect.get(nested, "code")
  return typeof code === "string" ? code : undefined
}

export const safeAuthErrorMessage = (error: unknown, fallback: string) => {
  const code = errorCode(error)
  return code ? (publicErrorMessages[code] ?? fallback) : fallback
}
