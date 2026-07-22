import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare"
import { withSentryConfig } from "@sentry/nextjs"

const safeOrigin = (value) => {
  if (!value) return undefined
  try {
    return new URL(value).origin
  } catch {
    return undefined
  }
}

const apiOrigin =
  safeOrigin(process.env.NEXT_PUBLIC_API_BASE_URL) ??
  "https://api.enterprise-agentic-saas.localhost"
const agentOrigin =
  safeOrigin(process.env.NEXT_PUBLIC_AGENT_BASE_URL) ??
  "https://agent.enterprise-agentic-saas.localhost"
const agentWebSocketOrigin = agentOrigin.replace(/^http/, "ws")
const sentryOrigin = safeOrigin(process.env.NEXT_PUBLIC_SENTRY_DSN)
const spotlightOrigin = safeOrigin(process.env.NEXT_PUBLIC_SENTRY_SPOTLIGHT)
const connectSources = [
  "'self'",
  apiOrigin,
  agentOrigin,
  agentWebSocketOrigin,
  sentryOrigin,
  spotlightOrigin,
].filter(Boolean)

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  allowedDevOrigins: [
    "enterprise-agentic-saas.localhost",
    "*.enterprise-agentic-saas.localhost",
  ],
  transpilePackages: [
    "@enterprise-agentic-saas/ui",
    "@enterprise-agentic-saas/api",
    "@enterprise-agentic-saas/auth",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "same-origin" },
          {
            key: "Content-Security-Policy",
            value: `connect-src ${[...new Set(connectSources)].join(" ")}`,
          },
        ],
      },
    ]
  },
}

const hasSentrySourceMapCredentials = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
  process.env.SENTRY_ORG &&
  process.env.SENTRY_PROJECT
)

export default withSentryConfig(nextConfig, {
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  telemetry: false,
  widenClientFileUpload: true,
  sourcemaps: {
    disable: !hasSentrySourceMapCredentials,
    deleteSourcemapsAfterUpload: true,
  },
  webpack: {
    automaticVercelMonitors: false,
    treeshake: {
      removeDebugLogging: true,
    },
  },
})

initOpenNextCloudflareForDev()
