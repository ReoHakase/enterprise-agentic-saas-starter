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
bun run --cwd apps/web dev:spotlight
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

## Sentry / Spotlight

- 通常の `dev` はSentryへ送信しない。`dev:spotlight` はlocal sidecarを起動し、error・trace・logを100%ローカル収集する。
- Spotlight endpointはloopback hostだけを許可し、productionでは設定が残っていても無効化する。Session Replayは使わない。
- productionは `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` をCloudflareとbuild環境へ注入する。errorは既定100%、traceは既定10%で、serverは`SENTRY_ERROR_SAMPLE_RATE` / `SENTRY_TRACES_SAMPLE_RATE`、browserは`NEXT_PUBLIC_SENTRY_ERROR_SAMPLE_RATE` / `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`から調整できる。
- source map uploadにはCIだけで `SENTRY_AUTH_TOKEN`、`SENTRY_ORG`、`SENTRY_PROJECT` を渡す。生成したbrowser source mapはupload後に削除する。
- SDK送信前にuser、cookie/header/body/query、email/IP、credential、tenant resource IDをredactする。Sentry project側のIP保存禁止・data scrubbingも併用する。
