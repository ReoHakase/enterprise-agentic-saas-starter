import { vi } from "vitest"

export const setRequiredAuthEnvironment = ({
  mailpitUrl = "",
}: {
  mailpitUrl?: string
} = {}) => {
  vi.stubEnv("NODE_ENV", "development")
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-at-least-32-characters-long")
  vi.stubEnv("BETTER_AUTH_URL", "https://api.example.test")
  vi.stubEnv("GITHUB_CLIENT_ID", "test-github-client")
  vi.stubEnv("GITHUB_CLIENT_SECRET", "test-github-secret")
  vi.stubEnv("GITHUB_OAUTH_EMULATOR_URL", "")
  vi.stubEnv("GITHUB_OAUTH_EMULATOR_CLIENT_ID", "")
  vi.stubEnv("GITHUB_OAUTH_EMULATOR_CLIENT_SECRET", "")
  vi.stubEnv("TRUSTED_ORIGINS", "https://app.example.test")
  vi.stubEnv("EMAIL_PROVIDER", "mailpit")
  vi.stubEnv("EMAIL_FROM", "noreply@example.com")
  vi.stubEnv("MAILPIT_URL", mailpitUrl)
}
