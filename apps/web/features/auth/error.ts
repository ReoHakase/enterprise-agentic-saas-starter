import * as v from "valibot"

const publicErrorMessages: Readonly<Record<string, string>> = {
  AUTHENTICATION_FAILED: "Authentication failed. Try again.",
  AUTH_CANCELLED: "Authentication was cancelled.",
  EMAIL_NOT_VERIFIED: "Verify your email address before signing in.",
  EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
    "Verify your email address before responding to this invitation.",
  FAILED_TO_UNLINK_LAST_ACCOUNT:
    "Connect another sign-in method before removing this one.",
  INVALID_EMAIL: "Enter a valid email address.",
  INVALID_EMAIL_OR_PASSWORD: "The email or password is incorrect.",
  INVALID_PASSWORD: "The email or password is incorrect.",
  INVALID_TOKEN: "This link is invalid. Request a new one.",
  INVITATION_NOT_FOUND: "This invitation is no longer available.",
  LINKED_ACCOUNT_ALREADY_EXISTS: "That account is already linked.",
  PASSKEY_NOT_FOUND: "That passkey is no longer available.",
  PASSWORD_TOO_LONG: "The password is too long.",
  PASSWORD_TOO_SHORT: "The password is too short.",
  PREVIOUSLY_REGISTERED: "That passkey is already registered.",
  REGISTRATION_CANCELLED: "Passkey registration was cancelled.",
  SESSION_EXPIRED: "Your session expired. Sign in again.",
  SESSION_NOT_FRESH: "Sign in again to continue.",
  SOCIAL_ACCOUNT_ALREADY_LINKED: "That account is already linked.",
  TOKEN_EXPIRED: "This link expired. Request a new one.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    "An account already exists for this email address.",
  USER_ALREADY_EXISTS: "An account already exists for this email address.",
  USER_NOT_FOUND: "We could not complete that request.",
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
    "This invitation belongs to another account.",
}

const errorCodeSchema = v.pipe(v.string(), v.regex(/^[A-Z][A-Z0-9_]{0,127}$/u))
const nestedAuthErrorSchema = v.object({
  error: v.object({ code: errorCodeSchema }),
})
const directAuthErrorSchema = v.object({ code: errorCodeSchema })

const errorCode = (error: unknown) => {
  try {
    const nestedResult = v.safeParse(nestedAuthErrorSchema, error)
    if (nestedResult.success) return nestedResult.output.error.code

    const directResult = v.safeParse(directAuthErrorSchema, error)
    return directResult.success ? directResult.output.code : undefined
  } catch {
    return undefined
  }
}

export const safeAuthErrorMessage = (error: unknown, fallback: string) => {
  const code = errorCode(error)
  return code ? (publicErrorMessages[code] ?? fallback) : fallback
}
