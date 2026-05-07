import "server-only"

export const serverEnv = {
  API_PUBLIC_URL:
    process.env.API_PUBLIC_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "https://api.enterprise-agentic-saas.localhost",
}
