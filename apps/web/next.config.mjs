import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare"
import { withSentryConfig } from "@sentry/nextjs"

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
