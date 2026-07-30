# @enterprise-agentic-saas/web

Next.js App RouterによるマルチテナントSaaS consoleです。productionはOpenNextでCloudflare Workersへdeployします。

## 境界

- DBを直接importせず、Server Component/browserともfirst-party Elysia routeは`@enterprise-agentic-saas/api/client`のEden clientで呼ぶ。feature内にraw `fetch` wrapperを作らない。
- Better Auth固有endpointは`@enterprise-agentic-saas/auth/client`、server session確認はserver-only auth helperへ分離する。
- server prefetchとbrowserのGET/mutationはTanStack Queryへ集約し、Web-local Valibot schemaをUI runtime境界として維持する。
- formはTanStack Form + Valibot、Issue/member tableはTanStack Tableを使う。Jotaiはdialog選択など再取得不要な一時UI状態だけに限定する。
- auth必須pageはserverでsessionを検証する。
- active organizationはsidebar switcherを唯一のscope selectorにする。
- shared primitiveは `packages/ui`、page/feature compositionはこのworkspaceに置く。
- app-owned画像名は`profileImage`に統一する。Userは円形、Organizationは角丸四角で表示し、選択・検証・upload progress・query invalidationはWeb、API非依存のcrop処理は`packages/ui`へ置く。

## Commands

```sh
bun run --cwd apps/web dev
bun run --cwd apps/web typecheck
bun run --cwd apps/web test
bun run --cwd apps/web test:e2e
bun run --cwd apps/web build
bun run --cwd apps/web build:cloudflare
bun run --cwd apps/web cf:typegen
```

Playwrightはlocal mock APIとNext.jsを同時起動し、登録/org作成、Issue/tenant切替、権限/tenant拒否を検証します。production互換はOpenNext dry-runとstaging smokeも必要です。

## Cloudflare

- `open-next.config.ts`: R2 incremental cache + regional cache
- `wrangler.jsonc`: Worker、assets、self reference、R2 binding
- `.dev.vars.example`: local Worker key template

本番buildでは `API_PUBLIC_URL` と `NEXT_PUBLIC_API_BASE_URL` を同じAPI originへ設定します。詳細は [`../../docs/deployment-operations.md`](../../docs/deployment-operations.md) を参照してください。

## OpenTelemetry / LGTM

- browserはPortlessの固定HTTPS OTLP aliasへ直接送信し、Next.js relayを使いません。
- Next serverは固定loopback OTLP endpointへ送信します。
- development、固定endpoint、worktree/session IDが揃う場合だけ初期化し、production remote backendは未構成です。
- local payloadを保持し、認証materialだけをredactします。binary/image bytesはmetadataだけを残します。
