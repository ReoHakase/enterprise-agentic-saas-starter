import { passkeyClient } from "@better-auth/passkey/client"
import { magicLinkClient, organizationClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

export const createAuthClientForBaseUrl = (baseURL: string) =>
  createAuthClient({
    baseURL,
    basePath: "/auth",
    plugins: [passkeyClient(), magicLinkClient(), organizationClient()],
  })

export const authClient = createAuthClientForBaseUrl(
  process.env.NEXT_PUBLIC_API_BASE_URL ?? ""
)
