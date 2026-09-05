# @enterprise-agentic-saas/web

TanStack StartとTanStack RouterによるマルチテナントSaaS consoleです。ViteとCloudflare Vite
pluginからCloudflare Workers向けのproduction bundleを生成します。

## 境界

- DBを直接importせず、route loader・server function・browserともfirst-party Elysia routeは`@enterprise-agentic-saas/api/client`のEden clientで呼ぶ。feature内にraw `fetch` wrapperを作らない。
- Agentの公開response schema、tool名、URL canonicalizerは`@enterprise-agentic-saas/agent-contracts`から直接importし、API clientのproxy exportを作らない。
- Better Auth固有endpointは`@enterprise-agentic-saas/auth/client`、server session確認はserver-only auth helperへ分離する。
- server prefetchとbrowserのGET/mutationはTanStack Queryへ集約し、Web-local Valibot schemaをUI runtime境界として維持する。
- Web固有projectionはValibotでUI runtime境界を検査する。formはTanStack Form + Valibot、Issue/member tableはTanStack Tableを使う。Jotaiはdialog選択など再取得不要な一時UI状態だけに限定する。
- auth必須pageはserverでsessionを検証する。
- active organizationはsidebar switcherを唯一のscope selectorにする。
- shared primitiveは `packages/ui`、page/feature compositionはこのworkspaceに置く。
- app-owned画像名は`profileImage`に統一する。Userは円形、Organizationは角丸四角で表示し、選択・検証・upload progress・query invalidationはWeb、API非依存のcrop処理は`packages/ui`へ置く。

## Commands

```sh
bun run --cwd apps/web dev
bun run --cwd apps/web lint
bun run --cwd apps/web typecheck
bun run --cwd apps/web test
bun run --cwd apps/web test:browser
bun run --cwd apps/web test:e2e
bun run --cwd apps/web build
bun run --cwd apps/web preview
bun run --cwd apps/web storybook
bun run --cwd apps/web build:storybook
bun run --cwd apps/web build:cloudflare
bun run --cwd apps/web cf:typegen
```

Playwrightはlocal mock APIとTanStack StartのVite previewを同時起動し、登録/org作成、
Issue/tenant切替、権限/tenant拒否を検証します。production互換はCloudflare Workers dry-runと
Vite previewの実ブラウザーsmokeで確認します。

## Cloudflare

- `vite.config.ts`: TanStack Start、Cloudflare、React、Tailwind CSS、Fumadocsの共通plugin構成
- `wrangler.jsonc`: Worker entry、compatibility flag、source map、observability
- `public/_headers`: Viteのfingerprint付きassetに対するimmutable cache header

本番buildでは `API_PUBLIC_URL` と `VITE_API_BASE_URL` を同じAPI originへ設定します。詳細は [`../../docs/deployment-operations.md`](../../docs/deployment-operations.md) を参照してください。
Vite configはAPI origin、local telemetry識別子、test判定だけをWorker varsへ渡します。親processの
環境変数全体を取り込まず、認証情報とdatabase tokenをbundleまたはWorker varsへ複製しません。

## OpenTelemetry / LGTM

- browserはPortlessの固定HTTPS OTLP aliasへ直接送信し、application relayを使いません。
- TanStack Start Workerは固定loopback OTLP endpointへ送信します。
- development、固定endpoint、worktree/session IDが揃う場合だけ初期化し、production remote backendは未構成です。
- local payloadを保持し、認証materialだけをredactします。binary/image bytesはmetadataだけを残します。
