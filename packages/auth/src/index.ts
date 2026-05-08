import { passkey } from "@better-auth/passkey"
import { db } from "@enterprise-agentic-saas/db"
import * as schema from "@enterprise-agentic-saas/db/schema"
import {
  createConsoleSender,
  createNoopSender,
  renderMagicLinkEmail,
  renderOrganizationInvitationEmail,
  type SendEmail,
} from "@enterprise-agentic-saas/email"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import {
  createAccessControl,
  magicLink,
  organization,
  role,
} from "better-auth/plugins"

import { env } from "./env"

const sendEmail: SendEmail =
  env.EMAIL_PROVIDER === "noop" ? createNoopSender() : createConsoleSender()

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

export const auth = betterAuth({
  appName: env.APP_NAME,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/auth",
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  trustedOrigins: env.TRUSTED_ORIGINS,
  socialProviders: {
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["github"],
    },
  },
  advanced: {
    crossSubDomainCookies: {
      enabled: true,
      domain: "enterprise-agentic-saas.localhost",
    },
    useSecureCookies: true,
  },
  plugins: [
    passkey({
      rpID: "enterprise-agentic-saas.localhost",
      rpName: env.APP_NAME,
    }),
    magicLink({
      async sendMagicLink({ email, url }) {
        const rendered = await renderMagicLinkEmail({
          appName: env.APP_NAME,
          url,
        })
        await sendEmail({ to: email, ...rendered })
      },
    }),
    organization({
      ac: organizationAccessControl,
      creatorRole: "super_admin",
      roles: {
        super_admin: superAdmin,
        admin,
        member,
      },
      async sendInvitationEmail(data) {
        const rendered = await renderOrganizationInvitationEmail({
          appName: env.APP_NAME,
          organizationName: data.organization.name,
          invitationUrl: `${env.BETTER_AUTH_URL}/accept-invitation/${data.id}`,
          inviterName: data.inviter.user.name ?? data.inviter.user.email,
        })
        await sendEmail({ to: data.email, ...rendered })
      },
    }),
  ],
})
