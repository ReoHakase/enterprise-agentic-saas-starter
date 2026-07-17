# Auth Reference

## singleton auth

```ts
// packages/auth/src/index.ts
import { db } from "@enterprise-agentic-saas/db"
import * as schema from "@enterprise-agentic-saas/db/schema"
import {
  renderMagicLinkEmail,
  renderVerificationEmail,
} from "@enterprise-agentic-saas/email"
import {
  backgroundTaskHandler,
  createRuntimeEmailSender,
} from "@enterprise-agentic-saas/email/runtime"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import {
  magicLink,
  multiSession,
  openAPI,
  organization,
} from "better-auth/plugins"

const sendEmail = createRuntimeEmailSender({
  provider: env.EMAIL_PROVIDER,
  runtime: env.NODE_ENV,
  from: env.EMAIL_FROM,
  fromName: env.APP_NAME,
})

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  trustedOrigins: env.TRUSTED_ORIGINS,
  advanced: {
    ...(backgroundTaskHandler
      ? { backgroundTasks: { handler: backgroundTaskHandler } }
      : {}),
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
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        const rendered = await renderMagicLinkEmail({
          appName: env.APP_NAME,
          url,
        })
        await sendEmail({ to: email, ...rendered })
      },
    }),
    multiSession({ maximumSessions: 5 }),
    openAPI({ disableDefaultReference: true }),
    organization({ /* custom roles and fail-closed hooks */ }),
  ],
})
```

実装では`env`で`BETTER_AUTH_SECRET`と`BETTER_AUTH_URL`を必須検証する。`EMAIL_FROM`はlocal/testだけ共通resolverで`noreply@example.test`へfallbackし、productionでは検証済みsenderを必須にしてfail-fastする。organization invitationの作成と送信はtenant guardとauditを持つ`apps/api`だけが行い、Better Auth pluginに別senderを作らない。

## auth client

```ts
// packages/auth/src/client.ts
import { createAuthClient } from "better-auth/client"
import {
  magicLinkClient,
  multiSessionClient,
  organizationClient,
} from "better-auth/client/plugins"

export const authClient = createAuthClient({
  plugins: [magicLinkClient(), multiSessionClient(), organizationClient()],
})
```

## client export

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./client": "./src/client.ts",
    "./openapi": "./src/openapi.ts"
  }
}
```

`./openapi`はserver-onlyとし、singletonの実plugin構成から`auth.api.generateOpenAPISchema()`を呼ぶ。apps/apiが結果を統合Scalar `/openapi`へ載せるため、Better Auth既定の`/auth/reference`は404にする。Webからこのsubpathをimportしない。

## auth schema 生成

`packages/db/src/schema/auth.generated.ts` は手書きせず Better Auth CLI で生成する。

```sh
bunx @better-auth/cli generate \
  --config packages/auth/src/index.ts \
  --output packages/db/src/schema/auth.generated.ts \
  --yes
```

plugin構成（magicLink, organization 等）を変えたら再生成 → git diff で確認 → commit。

## permission境界

auth packageに入れる:

- identity
- session
- organization membership
- coarse roles

app側に置く:

- issue/project/group resource permission
- billing permission
- audit log
- tenant data access check
