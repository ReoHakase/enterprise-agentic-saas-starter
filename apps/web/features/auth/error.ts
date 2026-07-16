import * as v from "valibot"

const publicAuthErrorCodes = [
  "AUTHENTICATION_FAILED",
  "AUTH_CANCELLED",
  "EMAIL_NOT_VERIFIED",
  "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION",
  "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED",
  "ERROR_CEREMONY_ABORTED",
  "FAILED_TO_UNLINK_LAST_ACCOUNT",
  "INVALID_EMAIL",
  "INVALID_EMAIL_OR_PASSWORD",
  "INVALID_PASSWORD",
  "INVALID_TOKEN",
  "INVITATION_NOT_FOUND",
  "LINKED_ACCOUNT_ALREADY_EXISTS",
  "PASSKEY_NOT_FOUND",
  "PASSWORD_TOO_LONG",
  "PASSWORD_TOO_SHORT",
  "PREVIOUSLY_REGISTERED",
  "REGISTRATION_CANCELLED",
  "SESSION_EXPIRED",
  "SESSION_NOT_FRESH",
  "SOCIAL_ACCOUNT_ALREADY_LINKED",
  "TOKEN_EXPIRED",
  "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
  "USER_ALREADY_EXISTS",
  "USER_NOT_FOUND",
  "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION",
] as const

export type PublicAuthErrorCode = (typeof publicAuthErrorCodes)[number]

const publicErrorMessages = {
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
  ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED:
    "That passkey is already registered.",
  ERROR_CEREMONY_ABORTED: "Passkey registration was cancelled.",
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
} satisfies Readonly<Record<PublicAuthErrorCode, string>>

const errorCodeSchema = v.picklist(publicAuthErrorCodes)
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

export type SafeAuthError = {
  code?: PublicAuthErrorCode
  message: string
}

export const parseSafeAuthError = (
  error: unknown,
  fallback: string
): SafeAuthError => {
  const code = errorCode(error)
  if (code) {
    return { code, message: publicErrorMessages[code] }
  }

  return { message: fallback }
}

export const safeAuthErrorMessage = (error: unknown, fallback: string) =>
  parseSafeAuthError(error, fallback).message
