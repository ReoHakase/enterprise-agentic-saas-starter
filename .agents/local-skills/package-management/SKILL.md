---
name: package-management
description: enterprise-agentic-saas-starterでdependency更新、Bun catalog、minimum release age、monorepo構成、apps/packages追加、依存方向、package exports、API client配置、config/contract/validators packageを作るべきか、Bun/Turborepo workspace設計を変更するときに使う。
---

# Package Management

このskillは、テンプレートとしてのmonorepo境界を変えるときに使う。アプリの題材はissue管理だが、前提は「グループ・権限・認証・監査を持つマルチテナントSaaS」を作るためのスターターである。

## まず守る判断基準

- Bun workspaceの外部依存versionはroot `workspaces.catalog` にexact versionで集約し、各packageでは `catalog:` を使う。
- Tiptap composerは`@tiptap/core/react/pm/starter-kit/extension-mention/extension-placeholder/suggestion`を同一exact versionでcatalog固定し、Web packageは`catalog:`だけを参照する。
- `bunfig.toml` の `[install] exact = true` と `.npmrc` の `save-exact=true` で `bun add` 時のexact保存を強制する。
- dependency更新は `bunfig.toml` の `minimumReleaseAge` を維持し、公開直後のlatestが拒否されるときは制約を迂回せず、通常の `bun install` で解決できる最新versionを選ぶ。
- dependency更新後は`bun update`で互換範囲内の推移依存も更新し、`bun outdated --recursive`と`bun audit`を確認する。複数majorが共存する推移依存をpackage名だけのglobal overrideで一律上書きせず、残るadvisoryは親packageの対応versionとruntime到達性を切り分ける。
- TypeScript 7では`baseUrl`が削除され、`types`の既定値が空になる。`paths`は各`tsconfig.json`からの相対pathで指定し、Node/Bun/Workers等のambient typeが必要なpackageは`types`へ明示する。
- `apps/*` は実行単位。Next.js web、Elysia API、将来のagent serverなどを置く。
- `packages/*` は下位の共有ライブラリ。実行環境を持たない。
- `apps/* -> packages/*` は許可。
- `packages/* -> apps/*` は禁止。
- backend内部を早期に細かいpackageへ分けない。Elysiaの型推論・Eden・`app.handle()` testを活かすため、featureはまず `apps/api` に寄せる。
- `packages/api-client` は作らない。Eden clientは `apps/api` から `@enterprise-agentic-saas/api/client` としてexportする。
- `packages/config` は作らない。envは実行単位ごとに違うため、`apps/api` は `src/env.ts`（envin + Valibot）に集約する。CLI向けの package（例: `packages/db`）も同様に `src/env.ts` で `export const env` する。
- `packages/validators` は作らない。API route schemaは`apps/api`、browserのform/view-model/props schemaは`apps/web`へ閉じ、WebはEden clientの型推論だけをAPI境界にする。
- `packages/shared` はpure TS utility/typeに限定し、SaaS固有の便利箱にしない。

## 推奨初期構成

```txt
apps/
  web/      # Next.js
  api/      # Elysia on Bun
  agent/    # optional: agent server, later

packages/
  db/          # Turso/libSQL + Drizzle
  auth/        # Better Auth core
  email/       # React Email templates + sender adapters
  ui/          # React DOM UI
  shared/      # pure TS only, minimal
```

`mobile`, `desktop`, `native-ui` は必要になってから追加する。

## API client

`apps/api/src/client.ts` に置く。`apps/api/src/index.ts` は `app.listen()` 専用なのでimport禁止。

```ts
import { treaty } from "@elysia/eden";
import type { App } from "./app";

export function createApiClient(baseUrl: string) {
  return treaty<App>(baseUrl, { parseDate: false });
}

export type ApiClient = ReturnType<typeof createApiClient>;
```

`apps/api/package.json` は `./client` entrypointを分ける。

`parseDate`は公開optionsから`Omit`し、optionsをspreadした後で必ず`false`を指定する。これによりEden runtimeがISO date文字列を`Date`へ暗黙変換せず、Elysiaの公開契約とWebの型が一致する。`apps/api`からWeb向けに`./types`やroot entrypointを追加しない。

## 迷ったとき

- app固有の実行時設定が必要なら `apps/<app>/src/env.ts`（envin + Valibot）。
- 複数server appから使うauth/session/roleなら `packages/auth`。
- DB schema/client/migrationなら `packages/db`。
- React Email templateやResend adapterなら `packages/email`。
- UI primitiveなら `packages/ui`。
- API route、service、repositoryのfeature実装なら `apps/api/src/modules/<feature>`。

詳細なpackage export例や禁止パターンを確認するときだけ `references/package-management.md` を読む。
