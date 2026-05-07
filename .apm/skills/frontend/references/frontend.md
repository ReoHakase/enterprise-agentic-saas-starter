# Frontend Reference

## env分離例

`apps/web/src/env.server.ts`:

```ts
import * as v from "valibot"

const ServerEnvSchema = v.object({
  NODE_ENV: v.optional(
    v.picklist(["development", "test", "production"]),
    "development"
  ),
})

export const serverEnv = parseEnv(ServerEnvSchema, process.env)
```

`apps/web/src/env.client.ts`:

```ts
import * as v from "valibot"

const ClientEnvSchema = v.object({
  NEXT_PUBLIC_API_URL: v.pipe(v.string(), v.url()),
  NEXT_PUBLIC_AUTH_URL: v.pipe(v.string(), v.url()),
})

export const clientEnv = parseEnv(ClientEnvSchema, {
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_AUTH_URL: process.env.NEXT_PUBLIC_AUTH_URL,
})
```

## Cloudflare

- Bunは開発・install・script実行に使う。
- Cloudflare Workers本番ではBun APIに依存しない。
- Next.js deployはOpenNext Cloudflare adapterを確認する。
- Cloudflare固有の制約はcontext7や公式docsで最新化する。

## Storybook配置

```txt
packages/ui/
  src/**/*.stories.tsx

apps/web/
  src/**/*.stories.tsx  # Next.js依存component
```

Storybook test runnerでa11y/interactionを確認し、Playwright E2Eには主要導線だけを残す。
