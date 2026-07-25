import type { AdditionalField as AdditionalFieldConfig } from "@better-auth-ui/core"
import { createAuthClientForBaseUrl } from "@enterprise-agentic-saas/auth/client"
import { http, HttpResponse } from "msw"
import Link from "next/link"
import type { ReactNode } from "react"
import { fn } from "storybook/test"

import preview from "#storybook/preview"
import { magicLinkPlugin } from "@/lib/auth/magic-link-plugin"

import { AdditionalField } from "../additional-field/additional-field"
import { Auth } from "../auth"
import {
  AuthPasswordField,
  AuthTextField,
} from "../auth-form-field/auth-form-field"
import { AuthProvider } from "../auth-provider/auth-provider"
import { AuthRouteScope } from "../auth-route-scope/auth-route-scope"
import { ForgotPassword } from "../forgot-password/forgot-password"
import { MagicLinkButton } from "../magic-link-button/magic-link-button"
import { MagicLink } from "../magic-link/magic-link"
import { PasskeySignInButton } from "../passkey-sign-in-button/passkey-sign-in-button"
import { ProviderButton } from "../provider-button/provider-button"
import { ProviderButtons } from "../provider-buttons/provider-buttons"
import { ResetPassword } from "../reset-password/reset-password"
import { SignIn } from "../sign-in/sign-in"
import { SignOut } from "../sign-out/sign-out"
import { SignUp } from "../sign-up/sign-up"

const storyAuthClient = Object.assign(
  createAuthClientForBaseUrl("https://api.example.test"),
  {
    signOut: async () => ({ data: null, error: null }),
  }
)
const navigate = fn()
const ignore = fn()
const emptyErrors: Array<{ message?: string } | undefined> = []
const authBasePaths = {
  auth: "/auth",
  settings: "/settings",
  organization: "/organization",
}
const emailAndPassword = {
  enabled: true,
  confirmPassword: true,
  forgotPassword: true,
  minPasswordLength: 8,
  maxPasswordLength: 128,
  name: true,
  rememberMe: true,
}
const authPlugins = [magicLinkPlugin()]
const socialProviders: Array<"github"> = ["github"]
const additionalField = {
  name: "department",
  type: "string",
  label: "Department",
  inputType: "select",
  defaultValue: "engineering",
  options: [
    { label: "Engineering", value: "engineering" },
    { label: "Operations", value: "operations" },
  ],
} satisfies AdditionalFieldConfig

const AuthStoryScope = ({ children }: { children: ReactNode }) => (
  <AuthProvider
    authClient={storyAuthClient}
    baseURL="https://api.example.test"
    basePaths={authBasePaths}
    emailAndPassword={emailAndPassword}
    Link={Link}
    navigate={navigate}
    plugins={authPlugins}
    redirectTo="/organization/acme/dashboard"
    socialProviders={socialProviders}
  >
    <AuthRouteScope
      addingAccount={false}
      reauthenticating={false}
      redirectTo="/organization/acme/dashboard"
    >
      {children}
    </AuthRouteScope>
  </AuthProvider>
)

const meta = preview.meta({
  title: "Web/Authentication",
  component: Auth,
  decorators: [
    (Story) => (
      <AuthStoryScope>
        <Story />
      </AuthStoryScope>
    ),
  ],
})

export const RoutedSignIn = meta.story({
  args: { view: "signIn" },
})

export const FormFields = meta.story({
  render: () => (
    <div className="grid max-w-sm gap-5">
      <AuthTextField
        autoComplete="email"
        disabled={false}
        errors={emptyErrors}
        invalid={false}
        label="Email"
        name="catalog-email"
        onBlur={ignore}
        onEdit={ignore}
        onValueChange={ignore}
        placeholder="person@example.test"
        type="email"
        value="person@example.test"
      />
      <AuthPasswordField
        autoComplete="current-password"
        disabled={false}
        errors={emptyErrors}
        hidePasswordLabel="Hide password"
        invalid={false}
        label="Password"
        name="catalog-password"
        onBlur={ignore}
        onEdit={ignore}
        onToggleVisibility={ignore}
        onValueChange={ignore}
        placeholder="Password"
        showPasswordLabel="Show password"
        value="correct-horse-battery-staple"
        visible={false}
      />
      <AdditionalField name="department" field={additionalField} />
    </div>
  ),
})

export const PasswordSignIn = meta.story({
  render: () => <SignIn />,
})

export const PasswordSignUp = meta.story({
  render: () => <SignUp />,
})

export const MagicLinkSignIn = meta.story({
  render: () => <MagicLink />,
})

export const ForgotPasswordForm = meta.story({
  render: () => <ForgotPassword />,
})

export const ResetPasswordForm = meta.story({
  render: () => <ResetPassword />,
})

export const AuthenticationMethods = meta.story({
  render: () => (
    <div className="grid max-w-sm gap-3">
      <ProviderButtons />
      <ProviderButton provider="github" />
      <MagicLinkButton view="signIn" />
      <PasskeySignInButton />
    </div>
  ),
})

export const SigningOut = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.post(
        "https://api.example.test/auth/sign-out",
        () => new HttpResponse(null, { status: 204 })
      )
    )
  },
  render: () => <SignOut />,
})
