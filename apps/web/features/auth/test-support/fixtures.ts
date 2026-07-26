import type { AdditionalField } from "@better-auth-ui/core"
import { createAuthClientForBaseUrl } from "@enterprise-agentic-saas/auth/client"
import { createElement, type ReactNode } from "react"
import { fn } from "storybook/test"

import Link from "@/test-support/storybook/next-link"

import { AuthProvider } from "../components/auth-provider/auth-provider"
import { AuthRouteScope } from "../components/auth-route-scope/auth-route-scope"
import { magicLinkPlugin } from "../magic-link-plugin"

export const authApiBaseUrl = "https://api.example.test"
const authRedirectTo = "/organization/acme/dashboard"
export const authNavigate = fn()

const authBasePaths = {
  auth: "/auth",
  settings: "/settings",
  organization: "/organization",
}

const emailAndPasswordConfig = {
  enabled: true,
  confirmPassword: true,
  forgotPassword: true,
  minPasswordLength: 8,
  maxPasswordLength: 128,
  name: true,
  rememberMe: true,
}

export const departmentField = {
  name: "department",
  type: "string",
  label: "Department",
  inputType: "select",
  defaultValue: "engineering",
  options: [
    { label: "Engineering", value: "engineering" },
    { label: "Operations", value: "operations" },
  ],
} satisfies AdditionalField

const storyAuthClient: ReturnType<typeof createAuthClientForBaseUrl> =
  createAuthClientForBaseUrl(authApiBaseUrl)

export const fictionalAuthUser = {
  id: "user_01K1AVERYSTONE0000000000",
  name: "Avery Stone",
  email: "avery@example.test",
  emailVerified: true,
  image: null,
  createdAt: "2026-07-01T09:00:00.000Z",
  updatedAt: "2026-07-26T09:30:00.000Z",
}

export const AuthStoryScope = ({
  addingAccount = false,
  additionalFields,
  children,
  reauthenticating = false,
  socialProviders = ["github"],
}: {
  addingAccount?: boolean
  additionalFields?: AdditionalField[]
  children: ReactNode
  reauthenticating?: boolean
  socialProviders?: Array<"github">
}) =>
  createElement(
    AuthProvider,
    {
      additionalFields,
      authClient: storyAuthClient,
      baseURL: authApiBaseUrl,
      basePaths: authBasePaths,
      emailAndPassword: emailAndPasswordConfig,
      Link,
      navigate: authNavigate,
      plugins: [magicLinkPlugin()],
      redirectTo: authRedirectTo,
      socialProviders,
    },
    createElement(
      AuthRouteScope,
      {
        addingAccount,
        reauthenticating,
        redirectTo: authRedirectTo,
      },
      children
    )
  )
