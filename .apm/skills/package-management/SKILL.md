---
name: package-management
description: enterprise-agentic-saas-starterでmonorepo構成、apps/packages追加、依存方向、package exports、API client配置、config/contract/validators packageを作るべきか、Bun/Turborepo workspace設計を変更するときに使う。
---

# Package Management

このskillは、テンプレートとしてのmonorepo境界を変えるときに使う。アプリの題材はtodoだが、前提は「グループ・権限・認証・監査を持つマルチテナントSaaS」を作るためのスターターである。

## まず守る判断基準

- `apps/*` は実行単位。Next.js web、Elysia API、将来のagent serverなどを置く。
- `packages/*` は下位の共有ライブラリ。実行環境を持たない。
- `apps/* -> packages/*` は許可。
- `packages/* -> apps/*` は禁止。
- backend内部を早期に細かいpackageへ分けない。Elysiaの型推論・Eden・`app.handle()` testを活かすため、featureはまず `apps/api` に寄せる。
- `packages/api-client` は作らない。Eden clientは `apps/api` から `@repo/api/client` としてexportする。
- `packages/config` は作らない。envは実行単位ごとに違うため、各appの `src/env.ts` に閉じる。
- `packages/validators` は「複数app/packageで同じValibot schemaを共有する」実需要が出てから作る。
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
  validators/ # optional, later
```

`mobile`, `desktop`, `native-ui` は必要になってから追加する。

## API client

`apps/api/src/client.ts` に置く。`apps/api/src/index.ts` は `app.listen()` 専用なのでimport禁止。

```ts
import { treaty } from "@elysiajs/eden";
import type { App } from "./app";

export function createApiClient(baseUrl: string) {
  return treaty<App>(baseUrl);
}

export type ApiClient = ReturnType<typeof createApiClient>;
```

`apps/api/package.json` は `./client` entrypointを分ける。

## 迷ったとき

- app固有の実行時設定が必要なら `apps/<app>/src/env.ts`。
- 複数server appから使うauth/session/roleなら `packages/auth`。
- DB schema/client/migrationなら `packages/db`。
- React Email templateやResend adapterなら `packages/email`。
- UI primitiveなら `packages/ui`。
- API route、service、repositoryのfeature実装なら `apps/api/src/modules/<feature>`。

詳細なpackage export例や禁止パターンを確認するときだけ `references/package-management.md` を読む。
