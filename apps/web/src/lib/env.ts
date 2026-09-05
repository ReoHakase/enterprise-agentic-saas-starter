export const clientEnv = {
  VITE_BROWSER_TEST: import.meta.env.VITE_BROWSER_TEST,
  VITE_API_BASE_URL:
    import.meta.env.VITE_API_BASE_URL ??
    "https://api.enterprise-agentic-saas.localhost",
  VITE_DEV_SESSION_ID: import.meta.env.VITE_DEV_SESSION_ID,
  VITE_DEV_WORKTREE_ID: import.meta.env.VITE_DEV_WORKTREE_ID,
  VITE_OTEL_EXPORTER_OTLP_ENDPOINT: import.meta.env
    .VITE_OTEL_EXPORTER_OTLP_ENDPOINT,
}
