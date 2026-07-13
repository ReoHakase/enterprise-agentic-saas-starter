const DEFAULT_AUTH_REDIRECT = "/dashboard"

const getFirstValue = (value: unknown) =>
  Array.isArray(value)
    ? value[0]
    : typeof value === "string"
      ? value
      : undefined

const includesControlCharacter = (value: string) =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || codePoint === 127
  })

export const sanitizeAuthRedirectTo = (
  value: unknown,
  fallback = DEFAULT_AUTH_REDIRECT
) => {
  const candidate = getFirstValue(value)
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback
  }

  let decoded = candidate
  for (let pass = 0; pass < 3; pass += 1) {
    try {
      decoded = decodeURIComponent(decoded)
    } catch {
      return fallback
    }

    if (
      decoded.startsWith("//") ||
      decoded.startsWith("/\\") ||
      includesControlCharacter(decoded)
    ) {
      return fallback
    }
  }

  const localOrigin = "https://auth-redirect.invalid"
  const url = new URL(candidate, localOrigin)
  if (url.origin !== localOrigin) {
    return fallback
  }

  const normalized = `${url.pathname}${url.search}${url.hash}`
  if (normalized.startsWith("//") || normalized.startsWith("/\\")) {
    return fallback
  }

  return normalized
}
