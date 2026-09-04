---
title: DBパッケージテスト戦略
status: accepted
implementation: active
last_reviewed: 2026-08-24
applies_to:
  - packages/db/**
related:
  - ../apps/api.md
  - ../common/test-data-and-fixtures.md
  - ../common/coverage.md
---

# DBパッケージテスト戦略

## 目的

`packages/db`は、libSQLクライアント、Drizzleスキーマ、マイグレーション、開発用初期データ投入と
リセットを所有します。

業務serviceや業務repositoryは所有しません。それらは`apps/api`のmoduleが所有し、A3で検査します。
DB packageでは、現在のスキーマ、空のデータベースへ適用する単一の基準マイグレーション、制約、
トリガー、並行処理、開発用初期データ投入とリセットの安全性を保証します。本番データベースは
未作成であり、ローカル開発データベースはリセットするため、過去のデータベースからの更新は
テスト契約に含めません。

## コード構造との対応

```text
packages/db/
  drizzle-v3/
    20260823163505_baseline/
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
      invariants.test.ts
      lifecycle.test.ts
```

このfile構成は推奨例です。テスト層を一つのtest fileと同一視しません。一つの層を複数fileへ分けても
よく、一つのfileに同じ層の複数scenarioを置いても構いません。

## 正本

```text
packages/db/src/schema/**
  現在のdesired schema

packages/db/drizzle-v3/**
  Drizzle v1が実行する基準マイグレーションと、main取り込み後に追加するマイグレーション

DB2からDB5
  constraint、trigger、concurrency、lifecycleの振る舞い
```

Drizzle v1更新を含む変更では、`20260823163505_baseline`だけを実行対象にします。この基準
マイグレーションが`main`へ取り込まれた時点から既存ディレクトリを不変にし、以後の変更は完全な
新規ディレクトリとして追加します。過去の履歴、マイグレーション台帳、既存データを再現する
フィクスチャや補助処理は持ちません。

## テスト層

| 名前                                           | Testing Trophy分類 | テスト内容                                                                                                                                                                                                                               | 実物として使うもの                                                             | 差し替えるもの                                      | Test Runner                                   | 量         |
| ---------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------- | --------------------------------------------- | ---------- |
| **DB補助ロジック単体テスト (DB1)**             | 単体               | 開発用初期データ投入計画、決定的生成、URL安全判定、リセット対象を確認する                                                                                                                                                                | pure helper、builder、config parser、deterministic generator                   | clock、random seed、filesystem abstraction          | Vitest Node                                   | 多い       |
| **DBスキーマ・制約統合テスト (DB2)**           | 統合               | 現在のスキーマへ直接rowを作り、外部キー、一意制約、部分一意制約、検査制約、cascade、テナント境界、所有者一意性、durable cleanup job、index、triggerを確認する                                                                            | current Drizzle schema、実libSQL、constraint、trigger、index                   | remote Turso、API repository、external provider     | Vitest + in-memory libSQL                     | 厚くする   |
| **DBマイグレーション統合テスト (DB3)**         | 統合               | 空のデータベースへ基準マイグレーションを適用し、現在のスキーマ、外部キー、明示的にNULLを拒否するテキスト主キー、リポジトリ所有のトリガー、現在有効なLunaの料金行へ到達することと、マイグレーション台帳が1行であることを確認する          | committed v3 SQL、snapshot、実libSQL                                           | remote Turso、業務API、provider                     | Vitest + in-memoryまたはtemporary-file libSQL | 厚くする   |
| **DB並行実行・耐久性統合テスト (DB4)**         | 統合               | 複数connectionから同時writeしても一意制約、CAS、job claim、fencingが破られないこと、transaction lock、busy、retry、rollback後の状態、失敗したworkerのlease解放を確認する                                                                 | temporary file libSQL、複数client、実transaction、WAL                          | cloud network latency、remote Turso service         | Vitest + temporary-file libSQL                | 必要な範囲 |
| **DBライフサイクル・運用安全統合テスト (DB5)** | 統合               | DB単体のリセットが基準マイグレーション適用後に開発用初期データを投入すること、rootのlocal data reset後はfixture投入を任意に選べること、DB/R2 fixtureの再開、遠隔URLとproductionでの拒否、所有していないprocessを停止しないことを確認する | local database lifecycle、migration command、seed、reset、temporary filesystem | production DB、remote cloud service、実利用者データ | Vitest + subprocessまたはlocal libSQL         | 少数       |

## DB固有の静的検査

DB層の実行テストとは別に、共通S0で次を検査します。

- `packages/db/drizzle/**`が存在しないこと
- Drizzle v1更新を含む変更では、`packages/db/drizzle-v3/**`が単一の完全な基準マイグレーションだけで
  あること
- 基準マイグレーションが`main`へ取り込まれた後は既存のv3ディレクトリの変更、削除、改名を拒否し、
  完全な新規ディレクトリだけを許可すること
- 現在のスキーマとv3マイグレーションの不整合がないこと
- リポジトリ所有のトリガーと現在有効なLunaの料金行が基準マイグレーションに含まれること
- 削除した履歴、移行補助処理、過去のデータベース用フィクスチャへの参照がないこと
- schemaからdevelopment、seed、test-supportへの逆依存がないこと
- production sourceからdevelopment helperへのimportがないこと

```sh
bun --cwd packages/db run db:check
```

## DB1: DB補助ロジック単体テスト

DB1はDB接続を必要としない規則へ限定します。

- seedのrelation graphが決定的である
- production URL判定がfail-closedである
- reset planが許可directory外を削除しない
- fixture manifestのpathとdigestが決定的である

過去のマイグレーション名を解釈する補助処理は所有しません。DBを実際に開かなければ証明できないものを
DB1へ置きません。

## DB2: DBスキーマ・制約統合テスト

DB2は現在のスキーマそのもののcontractを検査します。マイグレーション経路ではなく、到達後のDB
不変条件が対象です。

- organizationを越える外部キーを作れない
- 複数ownerの作成を一意indexで拒否する
- 同じidempotency keyを重複作成できない
- cleanup jobが必要な再試行状態を失わない
- cascadeの範囲が過大でない
- Better AuthとOAuthが同じテーブルへ定義するRelations v2の関連を実queryで同時に取得できる
- リポジトリ所有のトリガーが意図した状態遷移と不変条件を強制する
- `pragma foreign_key_check`が空になる

## DB3: DBマイグレーション統合テスト

DB3は空のデータベースから現在のスキーマへ到達する一つの経路を所有します。次のシナリオを必須に
します。

- Given 空のデータベース、When 基準マイグレーションを適用する、Then 現在のテーブル、列、
  インデックス、外部キー、検査制約へ到達し、外部キー検査が成功する。
- Given 空のデータベース、When 基準マイグレーションを適用する、Then すべてのテキスト主キーが
  明示的な`NOT NULL`制約を持ち、SQLiteのrowid tableでもNULLを拒否する。
- Given 空のデータベース、When 基準マイグレーションを適用する、Then リポジトリが所有する
  トリガーが期待する名前で作成され、DB2が現在の状態遷移と不変条件を検査できる。
- Given 空のデータベース、When 基準マイグレーションを適用する、Then 現在有効なLunaの料金行が
  期待する識別子、model、単価、通貨、有効期間で1行だけ作成される。
- Given 基準マイグレーション適用済みのデータベース、When 現在のDrizzle schemaで代表的なinsertと
  queryを行う、Then Relations v2、Better Auth 1.7、テナント制約を含む代表操作が成功する。

追加のv3マイグレーションが`main`へ取り込まれた後は、その変更で初めて必要になるデータ移行と更新
経路をDB3へ追加します。一マイグレーション一test fileにはせず、規則と観測結果でscenarioをまとめます。

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

- packageの`db:reset`は基準マイグレーションを適用してからDBの開発用初期データを投入する
- rootの`dev:db:reset`はlocal TursoとR2 stateを削除し、開発用初期データ投入を自動実行しない
- rootの`dev:db:seed`を明示実行すると、DB rowとR2 fixtureが決定的に作成される
- local専用commandをproductionで起動できない
- remote Tursoへresetまたはseedできない
- lifecycle commandが所有していないprocessを停止しない
- migration failure後に明確な終了codeを返す
- seedとR2 fixtureの途中状態を再実行で収束させる

## `apps/api`との責務分担

| 保証                                                             | 所有者     |
| ---------------------------------------------------------------- | ---------- |
| table、column、FK、unique、check、trigger                        | DB2        |
| 新規DBへの基準マイグレーション、トリガー、現在有効なLunaの料金行 | DB3        |
| DB concurrency primitive                                         | DB4        |
| reset、任意seed、remote refusal                                  | DB5        |
| IssueRepositoryのtenant predicate                                | API A3     |
| pagination、business query、DB error mapping                     | API A3     |
| transactionを使う業務順序                                        | API A2、A3 |

Relations v2の`adapter`接続はAuth AUTH2、GitHubの`issuer`はAuth AUTH4とE1が所有します。API repository
変更時には、API A3だけでなくDB packageのfull testも実行します。repositoryのSQL利用とDB constraintの
両方を確認するためです。

## 実行

```sh
bun --cwd packages/db run db:check
bun --cwd packages/db run test
```

migration、schema、repository、DB infrastructure変更ではfull suiteを実行します。

## 受入条件

- DB packageが業務repositoryを所有しない
- schema、migration history、behaviour contractの正本が明確である
- 空のデータベースから単一の基準マイグレーションだけで現在のスキーマへ到達する
- 基準マイグレーションがリポジトリ所有のトリガーと現在有効なLunaの料金行を再現する
- マイグレーション台帳が基準マイグレーションの1行だけを持つ
- 過去のデータベース、マイグレーション台帳、既存データの移行処理とテストを持たない
- constraint自体とAPI repository利用を区別する
- concurrencyをtemporary file DBと複数connectionで検査する
- リセット、任意の開発用初期データ投入、遠隔DB拒否をDB5で検査する
- 基準マイグレーションが`main`へ取り込まれた後はv3履歴を追記専用にする
- test fileではなく責務でDB1からDB5を定義する
