---
name: database
description: enterprise-agentic-saas-starterのTurso/libSQL、Drizzle、SQLite schema、packages/db、migration、DB env、Turso MCP、apps/api db plugin、repository、PostgresやDB_PROVIDERを追加すべきか判断するときに使う。
---

# Database

このskillは `packages/db`、Turso/libSQL、Drizzle schema/client/migrationを変更するときに使う。

## 方針

- primary DBはTurso/libSQL。
- `packages/db` はSQLite/libSQL専用。
- schemaは `sqliteTable` のみ。
- clientは `drizzle-orm/libsql` と `@libsql/client`。
- Drizzle Kitは `dialect: "turso"`。
- `DB_PROVIDER` やdialect分岐は作らない。
- Postgres対応は明示要求があるまで入れない。

## 構成

```txt
packages/db/
  src/
    env.ts           # envin + Valibot (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN)
    schema/
      auth.ts        # Better Auth CLI で生成 — 手書き禁止
      app.ts         # アプリ固有テーブル (issues 等)
      index.ts       # re-export
    seed.ts          # 非破壊・決定的な開発用seed
    reset.ts         # local限定のmigration-first手動reset
    wait.ts          # local Turso接続待機
    index.ts         # singleton db export
  drizzle/           # commitするSQL、snapshot、migration journal
  drizzle.config.ts
```

## singleton export

`packages/db/src/index.ts` は singleton の `db` をexportする。ファクトリは作らない。

```ts
import { db } from "@enterprise-agentic-saas/db"; // singleton
import type { Db } from "@enterprise-agentic-saas/db"; // 型
import * as schema from "@enterprise-agentic-saas/db/schema"; // テーブル定義
```

env変数は `src/env.ts`（envin + Valibot）で検証し、`src/index.ts` が import 時に読む。`apps/api` 側で重複して読む必要はない。

## auth schema 生成

`src/schema/auth.generated.ts` は Better Auth CLI で生成する。手で書かない。

ただしCLIはrepo固有の`member_organization_user_uidx`、organizationごとのsuper admin partial unique、pending invitation partial uniqueを生成できず、既存fileを上書きすると削除する。再生成前後を必ずdiffし、formatterだけの差分を除いたうえで、これらの標準生成外制約を消した結果を採用しない。具体的なoverlay一覧は`references/database.md`を正本にする。OAuth provider追加のようにDB modelを増やさないplugin変更は、最終的にschema no-diffであることを確認する。

```sh
bunx @better-auth/cli generate \
  --config packages/auth/src/index.ts \
  --output packages/db/src/schema/auth.generated.ts \
  --yes
```

auth pluginの構成（magicLink, organization 等）を変えたら必ず再生成する。生成後の差分はgit diffで確認してcommitする。

## apps/apiとの境界

- `apps/api` は `import { db } from "@enterprise-agentic-saas/db"` でsingleton を受け取り、`decorate("db", db)` する。
- routeからserviceへ必要なDBを渡す。serviceへElysia Context丸ごとは渡さない。
- repositoryはDrizzle errorをcatchして、`publicErrors.internal(cause, { operation })` の形に包む。

## MCP

- Tursoの現在仕様やCLI/APIの確認が必要なときはTurso MCPまたは公式情報を優先する。
- Drizzle/Tursoのバージョン差分は変わりやすいので、依存追加やmigration設定変更前に確認する。
- 開発用DBは `packages/db/.local/turso/dev.db` に永続化する。gitには入れない。
- local dev bootstrapは `turso dev -> wait -> generate -> migrate -> studio` の順にする。日常の`bun run dev`へseedやtestを混ぜず、開発起動でも `drizzle-kit push` は使わない。
- schema変更は `db:generate` でSQL/snapshotを保存し、SQLとdata backfillをレビューしてから `db:migrate` する。CIは `db:check` とfresh/legacy migration testを通す。
- seedは `drizzle-seed` を使う。auth/appの `text("id")` primary key は実アプリの生成と合わせて `f.uuid()` を明示し、整数風や任意文字列のIDを混ぜない。
- seedは既存userがいるDBを破壊せずskipする。seed自体も `file:` またはlocalhost URLだけを許可し、Cloud Tursoへ開発用fake dataを投入しない。本番provisioningはmigrationと実ユーザーの明示的な初期管理者作成を別経路で行う。
- development seedのuser avatarは、user UUIDをseed parameterにした`https://api.dicebear.com/10.x/lorelei/svg`の決定的URLを保存する。名前、email、生成順へ依存させず、Webのavatar URL allowlistと整合させる。
- rootのDB開発入口は`bun run dev:db`、local Tursoと対応R2 stateのresetは`bun run dev:db:reset`、任意fixture provisioningは`bun run dev:db:seed`にする。`dev:db:*`はDB metadataと対応R2 stateを一貫させるlocal data lifecycleの公開入口であり、package内部の`db:*` scriptはschema作業・migration・診断用として区別する。rootの`seed` aliasは作らない。
- `bun run dev:db:seed`はhealthyなAPI dev sessionがあれば既存Workerを再利用する。dev停止中はlocal Tursoが停止中の場合だけ一時起動し、`generate + migrate`、DB seed、`apps/api/.wrangler/state`を使う一時Wrangler経由のR2 reconcileを行う。完了・失敗・signal時は自身が起動したprocessだけを停止し、既存processと永続stateには触れない。初回fixtureはseed後に`bun run dev`、resetはdev停止 → `dev:db:reset` → 任意の`dev:db:seed` → `dev`とする。通常の`bun run dev`へseedを混ぜず、production/remote seedを拒否する。
- package内部の`db:reset`によるtable作り直しはlocal URLかつ `CONFIRM_DB_RESET=reset-local-development` の明示時だけ許可し、migration ledgerを含むtableをdrop → 保存済みmigration全適用 → seedの順にする。
- local devで `turso dev` を使う場合、Turso CLIだけでなく `sqld` が `PATH` に必要。Cloud DB作成は `turso auth login` 済みでないと実行できない。
- `turso dev --db-file .local/turso/dev.db` は親directoryを自動作成しない。`db:turso:serve` は起動前に `.local/turso` を作成し、clean checkoutで`health check ... connection refused`にしない。

## Tenant DB制約

- tenant tableのrepository queryは常に `id + organizationId` を条件にする。
- `issue_comments(issue_id, organization_id)` と `issue_activity_events(issue_id, organization_id)` は `issues(id, organization_id)` への複合外部キーを持たせる。単独issue IDだけのFKでtenant整合性を表現せず、Issue削除時はcomment/activityをcascade削除する。
- pending invitationは `(organization_id, lower(email)) WHERE status='pending'` のpartial unique indexで同時duplicateを防ぐ。insert前にemailをlowercase保存し、expiredを更新しても、raceの最終防御はDBへ置く。
- organization招待は、全invitation・各audit・各`invitation_email_jobs`を同じtransactionで作る。`invitation_email_jobs`は`invitation_id`をunique FK（`ON DELETE CASCADE`）にし、recipient、token、URL、organization/user IDを複製せず、status・attempt・lease・安全なerror codeだけを持つ。schema変更は必ず`db:generate`でmigration/snapshotを保存し、privacy列allowlistとcascade/unique/checkをmigration testで固定する。
- 招待再送/期限切れ復活は新しいjob rowやschema列を増やさず、同じinvitationと一意outbox rowをtransactionで再queueする。`createdAt`とjob `attempts`は保持し、status、expiry、inviter、error/lease/completedだけを更新する。attemptsをresetすると旧workerのfencing tokenと衝突し得るため禁止する。job欠損だけunique FKの同じ形で再作成する。
- membershipは `(organization_id, user_id)` をuniqueにする。既存duplicateは最古の `(created_at, id)` rowをsurvivorにし、roleは `super_admin > admin > member` の最強値を引き継いでから削除する。
- memberがいるorganizationはmigrationで最古のsuper adminだけを残し、ゼロならadmin優先・次にmember・最後に `(created_at, id)` の安定順で1名を昇格する。`role='super_admin'` のorganization partial unique indexはat-most-oneだけを保証するため、通常mutationはtransaction内でat-least-oneも維持する。memberがいないorganizationへmigrationがidentityを捏造してはならず、accessはfail closedにする。
- pending invitationのroleは `admin` / `member` だけを許可し、migration時の `owner` / `super_admin` / null /未知roleはfail closedでexpiredにする。
- SQLite table rebuildやunique index追加は既存dataのbackfill/dedupをmigration SQLに含め、legacy fixtureで変換をtestする。
- issueの`due_date`はDB内部では`timestamp_ms`として保存する。HTTP公開契約はISO timestampまたは`null`とし、時刻をUTC midnightへ丸めずrepository境界で相互変換する。Edenの自動Date復元へ依存しない。
- TodoからIssueへのrename migrationはtable/column/index/FKを物理renameし、既存commentとorganization内連番uniqueを保持する。旧汎用update auditはold/new値を捏造せず`legacy_updated` activityへbackfillし、audit action/target/metadata keyも`issue.*`、`issue_comment`、`issueId`へ移行する。fresh DBとlegacy fixtureの両方でmigrationを検証する。
- organization削除はtenant tableの`organization_id`外部keyを`ON DELETE CASCADE`にして即時削除をDBでも保証し、対象organizationを指す全sessionは同じtransactionでnullへ戻す。R2 cleanup用`organization_deletion_jobs`は削除後も残すためorganization外部keyを意図的に持たせず、slug・email・本文等のPIIを保存しない。`(requested_by_user_id, idempotency_key)` uniqueで同じactorの再送と別organizationへのkey衝突を決定的に判定する。

具体的なschema/client/migration例が必要なときだけ `references/database.md` を読む。

## package品質

- `packages/db/oxlint.config.ts` はroot configをextendsし、server-only TypeScriptとVitest向けpluginだけを使う。React/Browser系pluginは入れない。
- READMEには役割、公開entrypoint、依存方向、env境界、test方法、入れないものを書く。
- unit testでは実Turso接続を要求せず、`file::memory:` でclient境界とschema exportを確認する。
