# Auth Reference

## singleton auth

```ts
// packages/auth/src/index.ts
import { db } from "@enterprise-agentic-saas/db"
import * as schema from "@enterprise-agentic-saas/db/schema"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { magicLink, organization } from "better-auth/plugins"

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  trustedOrigins:
    process.env.TRUSTED_ORIGINS?.split(",")
      .map((o) => o.trim())
      .filter(Boolean) ?? [],
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        console.log(`[auth] magic link for ${email}: ${url}`)
      },
    }),
    organization({
      sendInvitationEmail: async (data) => {
        console.log(
          `[auth] invitation for ${data.email} to ${data.organization.name}`
        )
      },
    }),
  ],
})
```

`BETTER_AUTH_SECRET` と `BETTER_AUTH_URL` は Better Auth が `process.env` から自動読み込みする。

## auth client

```ts
// packages/auth/src/client.ts
import { createAuthClient } from "better-auth/client"
import { magicLinkClient, organizationClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  plugins: [magicLinkClient(), organizationClient()],
})
```

## client export

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./client": "./src/client.ts"
  }
}
```

## auth schema 生成

`packages/db/src/schema/auth.ts` は手書きせず Better Auth CLI で生成する。

```sh
bunx @better-auth/cli generate \
  --config packages/auth/src/index.ts \
  --output packages/db/src/schema/auth.ts \
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

- todo/project/group resource permission
- billing permission
- audit log
- tenant data access check
