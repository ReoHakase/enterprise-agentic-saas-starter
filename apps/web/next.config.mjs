/** @type {import('next').NextConfig} */
const nextConfig = {
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

export default nextConfig
