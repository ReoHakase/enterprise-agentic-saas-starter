import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare"
import { createMDX } from "fumadocs-mdx/next"

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
const configuredWebOrigin = safeOrigin(process.env.APP_BASE_URL)
const webHostname = configuredWebOrigin
  ? new URL(configuredWebOrigin).hostname
  : "enterprise-agentic-saas.localhost"
const otelOrigin =
  safeOrigin(process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT) ??
  "https://otel.enterprise-agentic-saas.localhost"
const connectSources = ["'self'", apiOrigin, otelOrigin].filter(Boolean)

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  allowedDevOrigins: [webHostname],
  transpilePackages: [
    "@enterprise-agentic-saas/ui",
    "@enterprise-agentic-saas/api",
    "@enterprise-agentic-saas/auth",
  ],
  async redirects() {
    return [
      {
        source:
          "/organization/invitations/:invitationId((?!members$|settings$)[^/]+)",
        destination: "/invitations/:invitationId",
        permanent: false,
      },
    ]
  },
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

const withMDX = createMDX({
  macro: {
    include: ["**/src/lib/docs/source.ts"],
  },
})

export default withMDX(nextConfig)

if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev()
}
