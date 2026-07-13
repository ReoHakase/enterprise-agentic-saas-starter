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
- Next.js deployはOpenNext Cloudflare adapterを使い、`open-next.config.ts` と `wrangler.jsonc` をcommitする。
- Web incremental cacheは `NEXT_INC_CACHE_R2_BUCKET`、static assetsはOpenNext assets bindingを使う。
- Elysia Worker entrypointはCloudflare adapterで `.compile()` する。adapterはexperimentalなのでWrangler dry-runとstaging smokeを必須にする。
- compatibility date/flag、OpenNext/Elysia adapterの制約は公式docsで最新化する。

```sh
bun run --cwd apps/web cf:typegen
bun run --cwd apps/api cf:typegen
bun run build:cloudflare
```

## Storybook配置

```txt
packages/ui/
  src/**/*.stories.tsx

apps/web/
  src/**/*.stories.tsx  # Next.js依存component
```

Storybook 10のVitest addonをPlaywright browser providerで実行し、light/dark両projectでa11y/interactionを確認する。Playwright E2Eには主要導線だけを残す。

## shadcn Base UIとconsole layout

- Base UI presetは `apps/web/components.json` のaliasを使うため、`bunx --bun shadcn@latest apply <preset>` は `apps/web` をcwdにして実行する。
- registryが更新したprimitiveは `packages/ui/src/components` に置き、Next.js router、TanStack Query、API mutationを持つcompositionは `apps/web` に置く。
- `(console)/layout.tsx` が `ConsoleShell` を一度だけrenderし、pageは `PageShell` 以下だけを返す。page側で再度console wrapperを置かない。
- `getSession()` はAPI outageを未認証に見せない。401/200-nullはsign-inへ、network/5xxは最寄りのerror boundaryへ送る。
