---
title: DBパッケージテスト戦略
status: accepted
implementation: active
last_reviewed: 2026-07-26
applies_to:
  - packages/db/**
related:
  - ../apps/api.md
  - ../common/test-data-and-fixtures.md
  - ../common/coverage.md
---

# DBパッケージテスト戦略

## 目的

`packages/db`は、libSQL client、Drizzle schema、committed migration、開発seedとreset、DB test supportを所有します。

業務serviceや業務repositoryは所有しません。それらは`apps/api`のmoduleが所有し、A3で検査します。

DB packageでは、現在schemaの宣言だけでなく、fresh install、historical upgrade、data preservation、constraint、trigger、concurrency、seed/resetの安全性まで保証します。

## コード構造との対応

```text
packages/db/
  drizzle/
    *.sql
    meta/

  src/
    index.ts
    env.ts

    schema/
      auth.generated.ts
      app.ts
      index.ts

    development/
      seed.ts
      reset.ts
      local-database.ts

    migrations/
      helpers.ts
      fresh.test.ts
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

packages/db/drizzle/*.sql
packages/db/drizzle/meta/**
  migration historyとsnapshot

DB2からDB5
  constraint、data preservation、concurrency、lifecycleの振る舞い
```

schemaとmigrationが矛盾した場合、過去migrationを削除または書き換えて合わせません。append-onlyな新規migrationを生成し、upgrade testを追加します。

## テスト層

| 名前                                           | Testing Trophy 分類 | テスト内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 実物として使うもの                                                             | 差し替えるもの                                      | 対象コード/ファイル                                                                                | Test Runner                                   | 実行速度   | CI時間課金以外の費用 | 量         |
| ---------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------- | -------------------- | ---------- |
| **DB補助ロジック単体テスト (DB1)**             | 単体                | <ul><li>migration tag検索、fixture builder、seed plan、URL安全判定を確認する</li><li>同じseedから同じ値とrelationが生成されることを確認する</li><li>開始時刻と終了時刻、親子関係、unique keyなど複数field制約を確認する</li><li>remote URL、production mode、危険なreset targetの分類を確認する</li></ul>                                                                                                                                                                  | pure helper、builder、config parser、deterministic generator                   | clock、random seed、filesystem abstraction          | `packages/db/src/migrations/helpers.ts`の純粋部分、`development/**`のplan/guard、test data builder | Vitest Node                                   | 極めて速い | なし                 | 多い       |
| **DBスキーマ・制約統合テスト (DB2)**           | 統合                | <ul><li>current schemaへ直接rowを作り、FK、unique、partial unique、check、cascadeが働くことを確認する</li><li>tenant composite FK、owner一意性、durable cleanup job、idempotency、privacy columnの不変条件を確認する</li><li>indexとtriggerが期待どおり存在し、query plan上必要なindexが欠落していないことを確認する</li><li>`pragma foreign_key_check`が空になることを確認する</li></ul>                                                                                  | current Drizzle schema、実libSQL、constraint、trigger、index                   | remote Turso、API repository、external provider     | `packages/db/src/schema/**`、schema-specific integration test、constraint fixture                  | Vitest + in-memory libSQL                     | 速い       | なし                 | 厚くする   |
| **DBマイグレーション統合テスト (DB3)**         | 統合                | <ul><li>空DBへcommitted migrationを先頭から適用し、current schemaへ到達することを確認する</li><li>historical migration tagからcurrentへ更新し、legacy row、nullability、default、backfillを保持することを確認する</li><li>table rebuild後にtrigger、index、FK、dataが失われないことを確認する</li><li>migration再実行または途中失敗後の状態が安全であることを確認する</li><li>current repositoryの代表smoke operationがmigration後schemaで成功することを確認する</li></ul> | committed SQL、journal、snapshot、実libSQL、historical fixture                 | remote Turso、業務API、provider                     | `packages/db/drizzle/**`、`packages/db/src/migrations/**`、historical fixture                      | Vitest + in-memoryまたはtemporary-file libSQL | 速いから中 | なし                 | 厚くする   |
| **DB並行実行・耐久性統合テスト (DB4)**         | 統合                | <ul><li>複数connectionから同時writeしてもunique、CAS、job claim、fencingが破られないことを確認する</li><li>transaction lock、busy、retry、rollback後の状態を確認する</li><li>WAL、SHM、file-backed DBを使うcaseでprocess間に近い競合を再現する</li><li>失敗したworkerがleaseを保持し続けないことを確認する</li></ul>                                                                                                                                                       | temporary file libSQL、複数client、実transaction、WAL                          | cloud network latency、remote Turso service         | DB concurrency fixture、job/outbox/lease schema、`test-support/create-test-database.ts`            | Vitest + temporary-file libSQL                | 中から遅い | なし                 | 必要な範囲 |
| **DBライフサイクル・運用安全統合テスト (DB5)** | 統合                | <ul><li>local resetがmigration ledgerからDBを再構築し、廃止tableと古いstateを残さないことを確認する</li><li>seedが決定的で、再実行時に意図しない重複や破壊を起こさないことを確認する</li><li>persistent local DBとR2 fixtureの所有権、cleanup、途中失敗時の再開を確認する</li><li>remote URLとproduction modeでseed、reset、dangerous commandを拒否することを確認する</li><li>migration、seed、resetのcommand surfaceが誤ったtargetへ接続しないことを確認する</li></ul>    | local database lifecycle、migration command、seed、reset、temporary filesystem | production DB、remote cloud service、実利用者データ | `packages/db/src/development/**`、DB CLI command、lifecycle test、env guard                        | Vitest + subprocessまたはlocal libSQL         | 遅い       | なし                 | 少数       |

## DB固有の静的検査

DB層の実行テストとは別に、共通S0で次を検査します。

- journal、snapshot、SQLのhistory consistency
- current schemaとgenerated migrationのdrift
- base branchに存在したSQL、snapshot、journal entryのimmutability
- 新規migrationと末尾journal entryの対応
- schemaからdevelopment、seed、test-supportへの逆依存禁止
- production sourceからdevelopment helperへのimport禁止

```sh
bun --cwd packages/db run db:check
```

## DB1: DB補助ロジック単体テスト

DB1はDB接続を必要としない規則へ限定します。

例:

- `createMigrationPrefix({ through })`がjournal tagを正しく解決する
- 存在しないtagを早期失敗させる
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

DB3はfreshとupgradeを同じ層として扱います。どちらもcommitted migration historyを実行し、desired schemaへ到達する契約だからです。

historical stateは原則としてmigration prefixで作ります。

```ts
createMigrationPrefix({
  through: "0018_mysterious_sage",
})
```

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
- migration historyがappend-onlyである
- test fileではなく責務でDB1からDB5を定義する
