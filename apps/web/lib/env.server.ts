import "server-only"

export const serverEnv = {
  API_PUBLIC_URL:
    process.env.API_PUBLIC_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "https://api.enterprise-agentic-saas.localhost",
  SENTRY_DSN: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT,
  SENTRY_ERROR_SAMPLE_RATE: process.env.SENTRY_ERROR_SAMPLE_RATE,
  SENTRY_SPOTLIGHT: process.env.SENTRY_SPOTLIGHT,
  SENTRY_TRACES_SAMPLE_RATE: process.env.SENTRY_TRACES_SAMPLE_RATE,
}
