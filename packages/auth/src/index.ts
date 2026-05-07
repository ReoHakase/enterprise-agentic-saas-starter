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
import { magicLink, organization } from "better-auth/plugins"

import { env } from "./env"

const sendEmail: SendEmail =
  env.EMAIL_PROVIDER === "noop" ? createNoopSender() : createConsoleSender()

export const auth = betterAuth({
  appName: env.APP_NAME,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/auth",
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  trustedOrigins: env.TRUSTED_ORIGINS,
  advanced: {
    crossSubDomainCookies: {
      enabled: true,
      domain: "enterprise-agentic-saas.localhost",
    },
    useSecureCookies: true,
  },
  plugins: [
    magicLink({
      async sendMagicLink({ email, url }) {
        const rendered = await renderMagicLinkEmail({
          appName: env.APP_NAME,
          url,
        })
        await sendEmail({
          to: email,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
        })
      },
    }),
    organization({
      async sendInvitationEmail(data) {
        const rendered = await renderOrganizationInvitationEmail({
          appName: env.APP_NAME,
          organizationName: data.organization.name,
          invitationUrl: `${env.BETTER_AUTH_URL}/accept-invitation/${data.id}`,
          inviterName: data.inviter.user.name ?? data.inviter.user.email,
        })
        await sendEmail({
          to: data.email,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
        })
      },
    }),
  ],
})
