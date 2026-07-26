export type SpotlightTarget = boolean | string

const enabledValues = new Set(["1", "true", "yes"])
const localHostnames = new Set([
  "127.0.0.1",
  "[::1]",
  "host.docker.internal",
  "localhost",
])

const localSpotlightUrl = (value: string): string | false => {
  try {
    const url = new URL(value)
    const localHostname =
      localHostnames.has(url.hostname) || url.hostname.endsWith(".localhost")

    if (
      !localHostname ||
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password
    ) {
      return false
    }

    return url.toString()
  } catch {
    return false
  }
}

export const resolveSpotlightTarget = (
  value: string | undefined,
  environment: string
): SpotlightTarget => {
  if (environment !== "development" || !value) {
    return false
  }

  const normalized = value.trim()
  if (enabledValues.has(normalized.toLowerCase())) {
    return true
  }

  return localSpotlightUrl(normalized)
}
