import "server-only"

export const serverEnv = {
  API_PUBLIC_URL:
    process.env.API_PUBLIC_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "https://api.enterprise-agentic-saas.localhost",
  DEV_SESSION_ID: process.env.DEV_SESSION_ID,
  DEV_WORKTREE_ID: process.env.DEV_WORKTREE_ID,
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
}
