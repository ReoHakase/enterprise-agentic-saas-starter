---
title: DBパッケージテスト戦略
status: accepted
implementation: active
last_reviewed: 2026-08-23
applies_to:
  - packages/db/**
related:
  - ../apps/api.md
  - ../common/test-data-and-fixtures.md
  - ../common/coverage.md
---

# DBパッケージテスト戦略

## 目的

`packages/db`は、libSQLクライアント、Drizzleスキーマ、追記専用のマイグレーション、開発用初期
データ投入とリセット、DBテスト支援を所有します。

業務serviceや業務repositoryは所有しません。それらは`apps/api`のmoduleが所有し、A3で検査します。

DB packageでは、現在schemaの宣言だけでなく、fresh install、historical upgrade、data preservation、constraint、trigger、concurrency、seed/resetの安全性まで保証します。

## コード構造との対応

```text
packages/db/
  drizzle/                     # 旧形式31件の読み取り専用履歴
  drizzle-v3/
    <YYYYMMDDHHmmss>_<tag>/
      migration.sql
      snapshot.json

  src/
    index.ts
    env.ts

    schema/
      auth.generated.ts
      app.ts
      index.ts
      oauth-provider.ts
      relations.test.ts
      relations.ts

    development/
      seed.ts
      reset.ts
      local-database.ts

    migrations/
      helpers.ts
      fresh.test.ts
      ledger-upgrade.test.ts
      oauth-provider-upgrade.test.ts
      upgrades.test.ts
      invariants.test.ts
      concurrency.test.ts
      lifecycle.test.ts

    test-support/
      create-test-database.ts
```

このfile構成は推奨例です。テスト層を一つのtest fileと同一視しません。一つの層を複数fileへ分けてもよく、一つのfileに同じ層の複数scenarioを置いても構いません。

## 正本

```text
packages/db/src/schema/**
  現在のdesired schema

packages/db/drizzle/**
  Drizzle 0.xで作成した31件の不変な証拠。実行対象ではない

packages/db/drizzle-v3/**
  Drizzle v1が実行するマイグレーション履歴とスナップショット

DB2からDB5
  constraint、data preservation、concurrency、lifecycleの振る舞い
```

スキーマとマイグレーションが矛盾した場合、過去の履歴を削除または書き換えて合わせません。
新しい完全なv3ディレクトリを追加し、更新テストを追加します。旧形式の履歴は証拠として保持し、
ランタイム、テスト、ツールから参照しません。

## テスト層

| 名前                                           | Testing Trophy 分類 | テスト内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 実物として使うもの                                                             | 差し替えるもの                                      | 対象コード/ファイル                                                                                | Test Runner                                   | 実行速度   | CI時間課金以外の費用 | 量         |
| ---------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------- | -------------------- | ---------- |
| **DB補助ロジック単体テスト (DB1)**             | 単体                | <ul><li>migration tag検索、fixture builder、seed plan、URL安全判定を確認する</li><li>同じseedから同じ値とrelationが生成されることを確認する</li><li>開始時刻と終了時刻、親子関係、unique keyなど複数field制約を確認する</li><li>remote URL、production mode、危険なreset targetの分類を確認する</li></ul>                                                                                                                                                                  | pure helper、builder、config parser、deterministic generator                   | clock、random seed、filesystem abstraction          | `packages/db/src/migrations/helpers.ts`の純粋部分、`development/**`のplan/guard、test data builder | Vitest Node                                   | 極めて速い | なし                 | 多い       |
| **DBスキーマ・制約統合テスト (DB2)**           | 統合                | <ul><li>current schemaへ直接rowを作り、FK、unique、partial unique、check、cascadeが働くことを確認する</li><li>tenant composite FK、owner一意性、durable cleanup job、idempotency、privacy columnの不変条件を確認する</li><li>indexとtriggerが期待どおり存在し、query plan上必要なindexが欠落していないことを確認する</li><li>`pragma foreign_key_check`が空になることを確認する</li></ul>                                                                                  | current Drizzle schema、実libSQL、constraint、trigger、index                   | remote Turso、API repository、external provider     | `packages/db/src/schema/**`、schema-specific integration test、constraint fixture                  | Vitest + in-memory libSQL                     | 速い       | なし                 | 厚くする   |
| **DBマイグレーション統合テスト (DB3)**         | 統合                | <ul><li>空DBへcommitted migrationを先頭から適用し、current schemaへ到達することを確認する</li><li>historical migration tagからcurrentへ更新し、legacy row、nullability、default、backfillを保持することを確認する</li><li>table rebuild後にtrigger、index、FK、dataが失われないことを確認する</li><li>migration再実行または途中失敗後の状態が安全であることを確認する</li><li>current repositoryの代表smoke operationがmigration後schemaで成功することを確認する</li></ul> | committed v3 SQL、snapshot、実libSQL、historical fixture                       | remote Turso、業務API、provider                     | `packages/db/drizzle-v3/**`、`packages/db/src/migrations/**`、historical fixture                   | Vitest + in-memoryまたはtemporary-file libSQL | 速いから中 | なし                 | 厚くする   |
| **DB並行実行・耐久性統合テスト (DB4)**         | 統合                | <ul><li>複数connectionから同時writeしてもunique、CAS、job claim、fencingが破られないことを確認する</li><li>transaction lock、busy、retry、rollback後の状態を確認する</li><li>WAL、SHM、file-backed DBを使うcaseでprocess間に近い競合を再現する</li><li>失敗したworkerがleaseを保持し続けないことを確認する</li></ul>                                                                                                                                                       | temporary file libSQL、複数client、実transaction、WAL                          | cloud network latency、remote Turso service         | DB concurrency fixture、job/outbox/lease schema、`test-support/create-test-database.ts`            | Vitest + temporary-file libSQL                | 中から遅い | なし                 | 必要な範囲 |
| **DBライフサイクル・運用安全統合テスト (DB5)** | 統合                | <ul><li>local resetがmigration ledgerからDBを再構築し、廃止tableと古いstateを残さないことを確認する</li><li>seedが決定的で、再実行時に意図しない重複や破壊を起こさないことを確認する</li><li>persistent local DBとR2 fixtureの所有権、cleanup、途中失敗時の再開を確認する</li><li>remote URLとproduction modeでseed、reset、dangerous commandを拒否することを確認する</li><li>migration、seed、resetのcommand surfaceが誤ったtargetへ接続しないことを確認する</li></ul>    | local database lifecycle、migration command、seed、reset、temporary filesystem | production DB、remote cloud service、実利用者データ | `packages/db/src/development/**`、DB CLI command、lifecycle test、env guard                        | Vitest + subprocessまたはlocal libSQL         | 遅い       | なし                 | 少数       |

## DB固有の静的検査

DB層の実行テストとは別に、共通S0で次を検査します。

- `packages/db/drizzle/**`の全ファイルが`origin/main`とバイト単位で一致すること
- 旧31件と変換後31件の時刻、意味名、SQL本文、`--> statement-breakpoint`の1対1対応
- 既存のv3ディレクトリの変更、削除、改名を拒否し、完全な新規ディレクトリだけを許可すること
- 現在のスキーマとv3マイグレーションの不整合
- ランタイム、テスト、設定、運用コマンドから旧履歴への参照がないこと
- schemaからdevelopment、seed、test-supportへの逆依存禁止
- production sourceからdevelopment helperへのimport禁止

```sh
bun --cwd packages/db run db:check
```

## DB1: DB補助ロジック単体テスト

DB1はDB接続を必要としない規則へ限定します。

例:

- `createMigrationPrefix({ through })`がv3ディレクトリ名の昇順だけからprefixを作る
- 存在しないディレクトリ名を早期失敗させ、旧journalへ代替しない
- seedのrelation graphが決定的である
- production URL判定がfail-closedである
- reset planが許可directory外を削除しない

DBを実際に開かなければ証明できないものをDB1へ置きません。

## DB2: DBスキーマ・制約統合テスト

DB2はcurrent schemaそのもののcontractを検査します。migration pathではなく、到達後のDB不変条件が対象です。

例:

- organizationを越えるFKを作れない
- 複数ownerの作成を一意indexで拒否する
- 同じidempotency keyを重複作成できない
- cleanup jobが必要な再試行状態を失わない
- cascadeの範囲が過大でない

## DB3: DBマイグレーション統合テスト

DB3は新規データベースと途中状態からの更新を同じ層として扱います。どちらも追記済みのv3履歴を
実行し、現在のスキーマへ到達する契約だからです。

historical stateは原則としてmigration prefixで作ります。

```ts
createMigrationPrefix({
  through: "20260802175458_chubby_blackheart",
})
```

マイグレーション接頭辞は`packages/db/drizzle-v3/**`のディレクトリ名を昇順に並べて作ります。
旧ジャーナル、ファイルの作成時刻、別のマニフェストへ依存しません。

次のシナリオを必須にします。

- Given 空のデータベース、When v3履歴を先頭から適用する、Then 現在のスキーマへ到達し、外部キー検査が
  成功する。
- Given 旧形式31件を適用済みで旧列だけを持つマイグレーション台帳、When Drizzle v1の標準
  マイグレーターを実行する、Then `id`、`hash`、`created_at`を保持し、`name`を補完して
  既存行の`applied_at`を`NULL`に保ち、既存DDLを再実行しない。
- Given 意味のある複数のv3 prefixと既存データ、When currentまで更新する、Then 行、制約、
  インデックス、トリガーを保持する。
- Given Better Auth 1.7の`issuer`追加前の`credential`とGitHubアカウント、When 追記、既存データ補完、
  最終制約の3段階を適用する、Then 信頼済みの`issuer`だけを補完し、最終的に`NOT NULL`かつ
  `(issuer, account_id)`一意になる。
- Given 未知のプロバイダー、`credential`の識別子不一致、`issuer`重複、または補完不能な
  OAuthクライアント、
  When 既存データ補完を実行する、Then 推測で更新せずマイグレーションを失敗させる。
- Given 既存のOAuthクライアント、トークン、同意情報、`public`、`type`、コールバックURL、When
  Better Auth 1.7へ更新する、Then 既存値を保持し、新しいテーブルと列だけを追記する。

raw baseline SQLを許可する条件:

- migration導入前のschemaを再現する
- production historyに同等のledgerがない
- test内に理由を記載する
- 必要なmigration ledger stateを明示する

一migration一test fileにはしません。migrationが増えるたびにfileとfixtureが分散し、全体upgrade pathと不変条件を見失うためです。

## DB4: DB並行実行・耐久性統合テスト

DB4はin-memory connection一つでは再現できない競合へ限定します。

- unique race
- compare-and-swap
- job claim
- fencing token
- lock contention
- transaction rollback
- cancellation後のlease解放

flakyなsleepで競合を作らず、barrier、promise、transaction hookなどで実行順を制御します。

## DB5: DBライフサイクル・運用安全統合テスト

DB5は通常のquery correctnessではなく、開発・運用commandが誤った環境を破壊しないことを検査します。

- local専用commandをproductionで起動できない
- remote Tursoへresetまたはseedできない
- lifecycle commandが所有していないprocessを停止しない
- migration failure後に明確な終了codeを返す
- seedとR2 fixtureの途中状態を再実行で収束させる

## `apps/api`との責務分担

| 保証                                                 | 所有者     |
| ---------------------------------------------------- | ---------- |
| table、column、FK、unique、check、trigger            | DB2        |
| fresh/upgrade migration、backfill、data preservation | DB3        |
| DB concurrency primitive                             | DB4        |
| seed/reset/remote refusal                            | DB5        |
| IssueRepositoryのtenant predicate                    | API A3     |
| pagination、business query、DB error mapping         | API A3     |
| transactionを使う業務順序                            | API A2、A3 |

旧台帳の標準v1更新、Better Auth 1.7の既存データ補完、OAuthデータ保持もDB3が所有します。

API repository変更時には、API A3だけでなくDB packageのfull testも実行します。repositoryのSQL利用とDB constraintの両方を確認するためです。

## 実行

```sh
bun --cwd packages/db run db:check
bun --cwd packages/db run test
```

migration、schema、repository、DB infrastructure変更ではfull suiteを実行します。

## 受入条件

- DB packageが業務repositoryを所有しない
- schema、migration history、behaviour contractの正本が明確である
- freshだけでなくhistorical upgradeを検査する
- constraint自体とAPI repository利用を区別する
- concurrencyをtemporary file DBと複数connectionで検査する
- seed、reset、remote refusalをDB5で検査する
- 旧形式31件が不変で、変換後31件と1対1に対応する
- v3マイグレーション履歴が追記専用である
- 標準v1マイグレーターが旧台帳を更新し、独自の読み込み処理、二重台帳、DDL再実行がない
- Better Auth 1.7の`issuer`移行が未検証データを失敗時に拒否し、OAuthデータを保持する
- test fileではなく責務でDB1からDB5を定義する
