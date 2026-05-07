export const createAuthCallbackURL = (redirectTo: string) => {
  if (typeof window === "undefined") {
    return redirectTo
  }

  return new URL(redirectTo, window.location.origin).toString()
}
