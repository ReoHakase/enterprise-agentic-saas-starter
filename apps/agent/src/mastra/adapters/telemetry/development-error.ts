type DevelopmentEnvironment = { NODE_ENV?: string }

const nextCause = (value: unknown): unknown => {
  if (typeof value !== "object" || value === null || !("cause" in value)) {
    return undefined
  }
  return value.cause
}

export const reportDevelopmentCauseChain = (
  environment: DevelopmentEnvironment,
  label: string,
  cause: unknown
): void => {
  if (environment.NODE_ENV !== "development") return
  const seen = new Set<unknown>()
  let current: unknown = cause
  for (let depth = 0; depth < 8 && !seen.has(current); depth += 1) {
    seen.add(current)
    // Development only: the maintainer explicitly needs the provider's raw
    // Error and cause chain. Never route this payload to Sentry or Memory.
    // oxlint-disable-next-line no-console
    console.error(`[agent development] ${label} cause[${depth}]`, current)
    const nested = nextCause(current)
    if (nested === undefined) return
    current = nested
  }
}
