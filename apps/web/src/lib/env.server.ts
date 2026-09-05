export type ServerEnvironment = {
  API_PUBLIC_URL?: string
  DEV_SESSION_ID?: string
  DEV_WORKTREE_ID?: string
  OTEL_EXPORTER_OTLP_ENDPOINT?: string
  VITE_API_BASE_URL?: string
}

export const serverEnv = {
  get API_PUBLIC_URL() {
    return (
      process.env.API_PUBLIC_URL ??
      process.env.VITE_API_BASE_URL ??
      "https://api.enterprise-agentic-saas.localhost"
    )
  },
  get DEV_SESSION_ID() {
    return process.env.DEV_SESSION_ID
  },
  get DEV_WORKTREE_ID() {
    return process.env.DEV_WORKTREE_ID
  },
  get OTEL_EXPORTER_OTLP_ENDPOINT() {
    return process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  },
}
