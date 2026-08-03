import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider"
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client"
import { passkey } from "@better-auth/passkey"
import { db } from "@enterprise-agentic-saas/db"
import * as schema from "@enterprise-agentic-saas/db/schema"
import {
  renderMagicLinkEmail,
  renderOrganizationInvitationEmail,
  renderVerificationEmail,
  type SendEmail,
} from "@enterprise-agentic-saas/email"
import {
  backgroundTaskHandler,
  createRuntimeEmailSender,
} from "@enterprise-agentic-saas/email/runtime"
import { APIError, betterAuth, type BetterAuthPlugin } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { createAuthMiddleware } from "better-auth/api"
import {
  genericOAuth,
  magicLink,
  multiSession,
  openAPI,
  organization,
} from "better-auth/plugins"
import { and, eq, gt, isNull, or } from "drizzle-orm"

import { createSessionOrganizationDatabaseHooks } from "./callbacks/session-organization"
import { env, githubOAuthEnvironment } from "./env"
import {
  createMcpOAuthProvider,
  hashMcpOAuthToken,
  type McpOAuthAccessToken,
  MCP_OAUTH_ACCESS_TOKEN_PREFIX,
  MCP_OAUTH_SCOPES,
  MCP_PERMISSION_SCOPES,
  parseMcpOAuthStoredScopes,
} from "./mcp-oauth"
import { createGithubOAuthEmulatorProvider } from "./plugins/github-oauth-provider"

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
export const mcpOAuthResource = new URL("/mcp", env.BETTER_AUTH_URL).toString()
export const mcpOAuthIssuer = new URL("/auth", env.BETTER_AUTH_URL).toString()

const hasMcpMembership = async (input: {
  organizationId: string
  userId: string
}) => {
  const rows = await db
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.organizationId, input.organizationId),
        eq(schema.member.userId, input.userId)
      )
    )
    .limit(1)
  return rows.length === 1
}

const githubSocialProviders =
  githubOAuthEnvironment.mode === "github"
    ? {
        github: {
          clientId: githubOAuthEnvironment.clientId,
          clientSecret: githubOAuthEnvironment.clientSecret,
        },
      }
    : {}

// apps/api is the only organization management surface. Better Auth retains
// the native single-recipient invitation endpoint and the recipient endpoints.
export const blockedOrganizationPluginEndpoints = [
  { method: "POST", path: "/organization/create" },
  { method: "POST", path: "/organization/check-slug" },
  { method: "POST", path: "/organization/update" },
  { method: "POST", path: "/organization/delete" },
  { method: "GET", path: "/organization/get-full-organization" },
  { method: "POST", path: "/organization/set-active" },
  { method: "GET", path: "/organization/list" },
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

const requireInvitableOrganizationRole = (role: string | null | undefined) => {
  if (role !== "admin" && role !== "member") {
    throw APIError.from("BAD_REQUEST", {
      code: "INVALID_ORGANIZATION_INVITATION_ROLE",
      message: "Invitation role is not allowed",
    })
  }
}

export const organizationSecurityHooks = {
  async beforeCreateInvitation({
    invitation,
  }: {
    invitation: { role?: string | null }
  }) {
    requireInvitableOrganizationRole(invitation.role)
  },
  async beforeAcceptInvitation({
    invitation,
  }: {
    invitation: { role?: string | null }
  }) {
    requireInvitableOrganizationRole(invitation.role)
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
  createMcpOAuthProvider({
    hasMembership: hasMcpMembership,
    resource: mcpOAuthResource,
    webAppOrigin,
  }),
  openAPI({
    disableDefaultReference: true,
    path: "/reference",
  }),
  organization({
    creatorRole: "owner",
    organizationHooks: organizationSecurityHooks,
    async sendInvitationEmail({
      email,
      id,
      inviter,
      organization: invitedOrganization,
    }) {
      try {
        const rendered = await renderOrganizationInvitationEmail({
          appName: env.APP_NAME,
          invitationUrl: new URL(
            `/invitations/${encodeURIComponent(id)}`,
            webAppOrigin
          ).toString(),
          inviterName: inviter.user.name.trim() || undefined,
          organizationName: invitedOrganization.name,
        })
        await sendEmail({ to: email, ...rendered })
      } catch {
        authLogger.log("error", "Organization invitation email delivery failed")
      }
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
  hooks: {
    before: createAuthMiddleware(async (context) => {
      const requestPath = context.request
        ? new URL(context.request.url).pathname
        : undefined
      if (
        requestPath !== "/auth/oauth2/authorize" &&
        requestPath !== "/auth/oauth2/token"
      ) {
        return
      }

      const requestedResource =
        requestPath === "/auth/oauth2/authorize"
          ? context.query?.resource
          : context.body?.resource
      const resources = Array.isArray(requestedResource)
        ? requestedResource
        : [requestedResource]
      if (
        resources.length === 0 ||
        resources.some((resource) => resource !== mcpOAuthResource)
      ) {
        throw APIError.from("BAD_REQUEST", {
          code: "MCP_RESOURCE_REQUIRED",
          message: "The MCP resource is required",
        })
      }
    }),
  },
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

export const verifyMcpOAuthAccessToken = async (
  presentedToken: string
): Promise<McpOAuthAccessToken | null> => {
  if (!presentedToken.startsWith(MCP_OAUTH_ACCESS_TOKEN_PREFIX)) {
    return null
  }

  const token = presentedToken.slice(MCP_OAUTH_ACCESS_TOKEN_PREFIX.length)
  if (!token) {
    return null
  }

  const now = new Date()
  const rows = await db
    .select({
      clientDisabled: schema.oauthClient.disabled,
      clientId: schema.oauthAccessToken.clientId,
      createdAt: schema.oauthAccessToken.createdAt,
      expiresAt: schema.oauthAccessToken.expiresAt,
      organizationId: schema.oauthAccessToken.referenceId,
      scopes: schema.oauthAccessToken.scopes,
      userId: schema.oauthAccessToken.userId,
    })
    .from(schema.oauthAccessToken)
    .innerJoin(
      schema.oauthClient,
      eq(schema.oauthClient.clientId, schema.oauthAccessToken.clientId)
    )
    .where(
      and(
        eq(schema.oauthAccessToken.token, await hashMcpOAuthToken(token)),
        gt(schema.oauthAccessToken.expiresAt, now),
        or(
          isNull(schema.oauthClient.disabled),
          eq(schema.oauthClient.disabled, false)
        )
      )
    )
    .limit(1)
  const credential = rows[0]
  const scopes = parseMcpOAuthStoredScopes(credential?.scopes)
  if (
    !credential?.clientId ||
    credential.clientDisabled === true ||
    !credential.createdAt ||
    !credential.expiresAt ||
    !credential.organizationId ||
    !credential.userId ||
    !scopes
  ) {
    return null
  }

  return {
    audience: mcpOAuthResource,
    clientId: credential.clientId,
    expiresAt: credential.expiresAt,
    issuedAt: credential.createdAt,
    organizationId: credential.organizationId,
    scopes,
    userId: credential.userId,
  }
}

const mcpOAuthResourceActions = oauthProviderResourceClient(auth).getActions()

export const getMcpProtectedResourceMetadata = () =>
  mcpOAuthResourceActions.getProtectedResourceMetadata({
    resource: mcpOAuthResource,
    authorization_servers: [mcpOAuthIssuer],
    scopes_supported: [...MCP_PERMISSION_SCOPES],
    bearer_methods_supported: ["header"],
  })

export const handleMcpOAuthServerMetadata =
  oauthProviderAuthServerMetadata(auth)

export { MCP_OAUTH_SCOPES, MCP_PERMISSION_SCOPES }
