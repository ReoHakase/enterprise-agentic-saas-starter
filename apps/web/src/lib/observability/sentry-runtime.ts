export type SpotlightConfig = boolean | string

const LOCAL_SPOTLIGHT_HOSTS = new Set([
  "127.0.0.1",
  "[::1]",
  "host.docker.internal",
  "localhost",
])

export const resolveSpotlightConfig = (
  value: string | undefined,
  nodeEnv: string | undefined
): SpotlightConfig | false => {
  if (nodeEnv !== "development" || !value) {
    return false
  }

  const normalized = value.trim()
  if (normalized === "1" || normalized.toLowerCase() === "true") {
    return true
  }

  try {
    const url = new URL(normalized)
    const isLocalHostname =
      LOCAL_SPOTLIGHT_HOSTS.has(url.hostname) ||
      url.hostname.endsWith(".localhost")

    if (
      !isLocalHostname ||
      !["http:", "https:"].includes(url.protocol) ||
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

export const resolveSampleRate = (
  value: string | undefined,
  fallback: number
): number => {
  if (!value) {
    return fallback
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : fallback
}

export const resolveSentryDsn = (
  configuredDsn: string | undefined,
  nodeEnv: string | undefined,
  spotlight: SpotlightConfig | false
): string | undefined => {
  if (spotlight || nodeEnv !== "production") {
    return undefined
  }

  const normalized = configuredDsn?.trim()
  return normalized || undefined
}
