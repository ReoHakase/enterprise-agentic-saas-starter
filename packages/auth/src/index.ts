import { passkey } from "@better-auth/passkey"
import { db } from "@enterprise-agentic-saas/db"
import * as schema from "@enterprise-agentic-saas/db/schema"
import {
  renderMagicLinkEmail,
  renderVerificationEmail,
  type SendEmail,
} from "@enterprise-agentic-saas/email"
import {
  backgroundTaskHandler,
  createRuntimeEmailSender,
} from "@enterprise-agentic-saas/email/runtime"
import { APIError, betterAuth, type BetterAuthPlugin } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import {
  createAccessControl,
  genericOAuth,
  magicLink,
  multiSession,
  openAPI,
  organization,
  role,
} from "better-auth/plugins"

import { env, githubOAuthEnvironment } from "./env"
import { createGithubOAuthEmulatorProvider } from "./github-oauth-provider"
import { createSessionOrganizationDatabaseHooks } from "./session-organization"

const sendEmail: SendEmail = createRuntimeEmailSender({
  provider: env.EMAIL_PROVIDER,
  runtime: env.NODE_ENV,
  from: env.EMAIL_FROM,
  fromName: env.APP_NAME,
  mailpitUrl: env.MAILPIT_URL,
})

const webAppOrigin = env.TRUSTED_ORIGINS[0]
if (!webAppOrigin) {
  throw new Error("A trusted web application origin is required")
}
const webAppHostname = new URL(webAppOrigin).hostname
const authCookieDomain =
  env.AUTH_COOKIE_DOMAIN ??
  (env.NODE_ENV !== "production" && webAppHostname.endsWith(".localhost")
    ? webAppHostname
    : undefined)
if (!authCookieDomain) {
  throw new Error("AUTH_COOKIE_DOMAIN is required outside local development")
}
const useSecureCookies = new URL(env.BETTER_AUTH_URL).protocol === "https:"

const githubSocialProviders =
  githubOAuthEnvironment.mode === "github"
    ? {
        github: {
          clientId: githubOAuthEnvironment.clientId,
          clientSecret: githubOAuthEnvironment.clientSecret,
        },
      }
    : {}

const organizationAccessControl = createAccessControl({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
} as const)

const superAdmin = organizationAccessControl.newRole({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
})

const admin = organizationAccessControl.newRole({
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
})

const member = role({})

// apps/api is the only organization management surface. Better Auth retains
// only the invitation-recipient endpoints needed before organization access.
export const blockedOrganizationPluginEndpoints = [
  { method: "POST", path: "/organization/create" },
  { method: "POST", path: "/organization/check-slug" },
  { method: "POST", path: "/organization/update" },
  { method: "POST", path: "/organization/delete" },
  { method: "GET", path: "/organization/get-full-organization" },
  { method: "POST", path: "/organization/set-active" },
  { method: "GET", path: "/organization/list" },
  { method: "POST", path: "/organization/invite-member" },
  { method: "POST", path: "/organization/cancel-invitation" },
  { method: "GET", path: "/organization/list-invitations" },
  { method: "POST", path: "/organization/update-member-role" },
  { method: "POST", path: "/organization/remove-member" },
  { method: "GET", path: "/organization/get-active-member" },
  { method: "POST", path: "/organization/leave" },
  { method: "GET", path: "/organization/list-members" },
  { method: "GET", path: "/organization/get-active-member-role" },
  { method: "POST", path: "/organization/create-team" },
  { method: "POST", path: "/organization/remove-team" },
  { method: "POST", path: "/organization/update-team" },
  { method: "GET", path: "/organization/list-teams" },
  { method: "POST", path: "/organization/set-active-team" },
  { method: "GET", path: "/organization/list-user-teams" },
  { method: "GET", path: "/organization/list-team-members" },
  { method: "POST", path: "/organization/add-team-member" },
  { method: "POST", path: "/organization/remove-team-member" },
  { method: "POST", path: "/organization/create-role" },
  { method: "POST", path: "/organization/delete-role" },
  { method: "GET", path: "/organization/list-roles" },
  { method: "GET", path: "/organization/get-role" },
  { method: "POST", path: "/organization/update-role" },
  { method: "POST", path: "/organization/has-permission" },
] as const

export const organizationSecurityHooks = {
  async beforeAcceptInvitation({
    invitation,
  }: {
    invitation: { role?: string | null }
  }) {
    if (invitation.role !== "admin" && invitation.role !== "member") {
      throw APIError.from("BAD_REQUEST", {
        code: "INVALID_ORGANIZATION_INVITATION_ROLE",
        message: "Invitation role is not allowed",
      })
    }
  },
}

export const authLogger = {
  level: "warn" as const,
  disableColors: true,
  log(
    level: "debug" | "info" | "warn" | "error",
    _message: string,
    ..._args: unknown[]
  ) {
    const metadata = {
      component: "better-auth",
      event: level === "error" ? "request_failed" : "runtime_notice",
      level,
    }

    if (level === "error") {
      console.error(metadata)
      return
    }
    console.warn(metadata)
  },
}

const defineAuthPlugins = <const Plugins extends BetterAuthPlugin[]>(
  ...plugins: Plugins
) => plugins

const commonAuthPlugins = defineAuthPlugins(
  passkey({
    rpID: webAppHostname,
    rpName: env.APP_NAME,
    origin: env.TRUSTED_ORIGINS,
  }),
  magicLink({
    storeToken: "hashed",
    async sendMagicLink({ email, url }) {
      const rendered = await renderMagicLinkEmail({
        appName: env.APP_NAME,
        url,
      })
      await sendEmail({ to: email, ...rendered })
    },
  }),
  multiSession({
    maximumSessions: 5,
  }),
  openAPI({
    disableDefaultReference: true,
    path: "/reference",
  }),
  organization({
    ac: organizationAccessControl,
    creatorRole: "super_admin",
    organizationHooks: organizationSecurityHooks,
    roles: {
      super_admin: superAdmin,
      admin,
      member,
    },
  })
)

const authPlugins =
  githubOAuthEnvironment.mode === "emulator"
    ? defineAuthPlugins(
        genericOAuth({
          config: [createGithubOAuthEmulatorProvider(githubOAuthEnvironment)],
        }),
        ...commonAuthPlugins
      )
    : commonAuthPlugins

export const auth = betterAuth({
  appName: env.APP_NAME,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/auth",
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  databaseHooks: createSessionOrganizationDatabaseHooks(db),
  logger: authLogger,
  // better-call's fallback logger serializes arbitrary thrown errors. Let the
  // app-level error boundary produce the safe 500 response instead.
  onAPIError: {
    throw: true,
  },
  verification: {
    storeIdentifier: "hashed",
  },
  emailVerification: {
    async sendVerificationEmail({ user, url }) {
      const rendered = await renderVerificationEmail({
        appName: env.APP_NAME,
        url,
      })
      await sendEmail({ to: user.email, ...rendered })
    },
  },
  trustedOrigins: env.TRUSTED_ORIGINS,
  disabledPaths: blockedOrganizationPluginEndpoints.map(({ path }) => path),
  rateLimit: {
    enabled: process.env.NODE_ENV === "production",
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/magic-link": { window: 60, max: 5 },
      "/multi-session/set-active": { window: 60, max: 10 },
    },
  },
  socialProviders: githubSocialProviders,
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["github"],
      allowDifferentEmails: false,
      allowUnlinkingAll: false,
    },
  },
  session: {
    // App-owned destructive operations mirror this recent sign-in boundary.
    freshAge: 60 * 15,
  },
  advanced: {
    ...(backgroundTaskHandler
      ? { backgroundTasks: { handler: backgroundTaskHandler } }
      : {}),
    ipAddress: {
      ipAddressHeaders: ["cf-connecting-ip"],
    },
    crossSubDomainCookies: {
      enabled: true,
      domain: authCookieDomain,
    },
    useSecureCookies,
  },
  plugins: authPlugins,
})
