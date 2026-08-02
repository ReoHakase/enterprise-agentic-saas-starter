import { withEmulate } from "@emulators/adapter-next"

const portlessHostname = process.env.PORTLESS_URL
  ? new URL(process.env.PORTLESS_URL).hostname
  : undefined

/** @type {import("next").NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  allowedDevOrigins: portlessHostname ? [portlessHostname] : [],
}

export default withEmulate(nextConfig)
