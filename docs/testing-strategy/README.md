---
title: テスト戦略仕様書
status: accepted
implementation: active
last_reviewed: 2026-07-26
applies_to:
  - apps/**
  - packages/**
  - config/**
  - scripts/**
  - turbo.json
  - .github/workflows/**
---

# テスト戦略仕様書

## 目的

この文書群は、モノレポ内の各ワークスペースが、どの不具合を、どの実行環境で、どの費用を払って検出するかを定めます。

目標はテストケース数を増やすことではありません。要件を十分に証明できる最も小さく、速く、決定的な境界へテストを置き、実ブラウザー、全構成、実LLMへ送るケースを減らします。

テスト戦略はコード構造と独立ではありません。`domain`、`service`、`repository`、`route`、`adapter`、`composition`などの責務境界が、そのままテスト境界になります。テストしにくいコードは、依存方向または責務分割が曖昧である可能性を疑います。

## 設計上の主要な決定

### ワークスペース別のテスト層を維持する

API、Web、Agent、DB、認証、UI、メールでは、適切な実行環境と失敗原因が異なります。全ワークスペースを一つの共通番号へ押し込まず、次の分類を正本とします。

- API: `A1`から`A5`
- Web: `W1`から`W6`
- Agent: `G1`から`G5`
- DB: `DB1`から`DB5`
- Auth: `AUTH1`から`AUTH4`
- UI: `UI1`から`UI5`
- Email: `MAIL1`から`MAIL4`
- TypeScript config: `TS1`から`TS2`
- GitHub OAuth emulator: `GE1`から`GE3`
- E2E: `E1`と`E2`

Testing Trophy分類は、静的、単体、統合、E2Eという横断的な補助分類として併記します。

### 統合テストを中心にする

Testing Trophyでは、複数の本番単位を接続し、利用者から観測できる振る舞いを検証する統合テストを最も厚くします。

このリポジトリでは、次が統合テストに当たります。

- React componentとDOM、event、hookを接続するテスト
- Storybook storyを実Chromiumで実行するテスト
- Drizzle queryと実libSQLを接続するテスト
- Elysia route、schema、serviceを接続するテスト
- Agent loop、tool、stream、台本付きモデルを接続するテスト
- Better Auth、DB、cookie、HTTPを接続するテスト
- React Email templateとrendererを接続するテスト

単体テストは、純粋ロジック、境界値、安全規則、失敗分類を高速に網羅するために使います。E2Eは全構成の配線確認へ限定します。

### 量は定性的に管理する

固定比率は設けません。表では次の語を使います。

| 表現       | 意味                                         |
| ---------- | -------------------------------------------- |
| 非常に多い | 分岐、境界値、失敗、安全規則を細かく網羅する |
| 多い       | 主要な振る舞いと失敗経路を広く持つ           |
| 厚くする   | そのワークスペースで最も重視する層           |
| 必要な範囲 | 実行環境でしか証明できない要件だけを置く     |
| 少数       | 代表経路へ限定する                           |
| 最小       | リリース可否を判断する最終疎通だけを置く     |

ケース数は`it`の本数ではなく、独立した不具合リスクまたは利用者シナリオで数えます。table-driven testの入力行、light/darkの重複実行、同一シナリオの再試行は別ケースとして数えません。

### 実モデル評価はG5だけが所有する

ブラウザーなしの実モデル評価はAgent固有の`G5`で扱い、E2E文書へ重複して置きません。

### Web内で閉じる全画面テストはW6とする

実Next.jsと実ブラウザーを使っていても、API、Agent、DB、認証を差し替えてWeb内に閉じるテストはE2Eではありません。`Webアプリケーション統合テスト (W6)`としてWebが所有します。

Playwrightはランナーであり、テスト分類ではありません。

```text
Playwright + Next.js + downstream mock
  Webアプリケーション統合テスト

Playwright + Web + API + Agent + DB/Auth
  E2Eテスト
```

### E2Eを二層にする

- `E1 決定的E2Eテスト`: 実Web、API、Agent、DB、認証を使い、LLMと外部providerを決定的に差し替える
- `E2 完全E2Eテスト`: 実LLMと本番相当adapterを含み、リリース前に最小限だけ実行する

完全という語は、本番に限りなく近い配線を意味します。全権限、全失敗、全tool、全文品質を網羅するという意味ではありません。

### W5の内部区分を公開層へ増やさない

Web server moduleには、純粋なredirect判断とEden adapterのような統合境界が混在します。これらを`W5-U`と`W5-I`へ公開分割せず、`Webサーバー統合テスト (W5)`へまとめます。

純粋関数を抽出してVitest Nodeで直接検査することは許可しますが、ファイル配置、fixture、責務はW5が所有します。

### パッケージ自身がテスト戦略を所有する

`packages/db`、`packages/auth`、`packages/ui`、`packages/email`、`packages/typescript-config`は、利用側アプリの内部実装ではありません。各パッケージが自身の公開契約、内部runtime、生成物、運用上の安全性を保証します。

利用側アプリは、パッケージを利用するcompositionだけを検査します。

```text
package test
  package自身の公開契約と内部runtime

app test
  packageをappのcode layerへ接続した結果

E2E
  workspace間の最終配線
```

## Testing Trophy分類

| 分類 | この仕様での意味                                                          | 主な失敗                                                          |
| ---- | ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 静的 | コードを実行せず、型、構文、依存方向、生成物、設定を検査する              | 型不一致、未使用、cycle、deep import、schema drift、履歴改変      |
| 単体 | 一つの関数、object、service、executorを隔離し、依存を持たないか差し替える | 境界値、状態遷移、認可順序、失敗分類、入力検証                    |
| 統合 | 複数の本番単位または本番runtimeを接続する                                 | DB query、HTTP契約、DOM event、focus、stream、cookie、adapter配線 |
| E2E  | 利用者の入口から永続化または外部境界まで、全ワークスペースを接続する      | workspace間配線、認証、永続化、reload、実モデルを含む最終疎通     |

分類はランナー名で決めません。Testing Libraryでも複数単位を接続すれば統合です。PlaywrightでもWeb内に閉じていればW6の統合です。

## テスト層を選ぶ順序

1. 静的検査だけで防げるか確認する
2. 純粋関数または小さなserviceへ規則を分離できるか確認する
3. 実DB、実HTTP、実DOM、台本付きモデルを使う軽量統合で証明する
4. 実ブラウザーが必要な場合だけStorybookまたはBrowser Modeへ上げる
5. 実Next.jsのroute lifecycleが必要な場合だけW6へ上げる
6. workspace間の全配線だけをE1へ置く
7. 実モデルと本番相当adapterが必要な最終疎通だけをE2へ置く

上位層へ置く理由を説明できない場合は下位層へ戻します。

## 文書一覧

### 共通

- [静的検査](./common/static-analysis.md)
- [Storybookとブラウザーコンポーネントテスト](./common/storybook.md)
- [テストデータとfixture](./common/test-data-and-fixtures.md)
- [テストカバレッジ](./common/coverage.md)
- [CIと実行契約](./common/ci-execution.md)
- [視覚回帰テスト](./common/visual-regression.md)
- [参考資料](./common/references.md)

### アプリ

- [Web](./apps/web.md)
- [API](./apps/api.md)
- [Product Agent](./apps/agent.md)
- [GitHub OAuth emulator](./apps/github-emulator.md)

### パッケージ

- [DB](./packages/db.md)
- [Auth](./packages/auth.md)
- [UI](./packages/ui.md)
- [Email](./packages/email.md)
- [TypeScript config](./packages/typescript-config.md)

### 全構成

- [E2E](./e2e.md)

## 公開スクリプト

ルートで公開するテストスクリプトは、実行環境と費用で分けます。ワークスペース固有の層ごとにルートスクリプトを増やしません。

```json
{
  "scripts": {
    "test": "vitest run --config vitest.config.ts && turbo run test",
    "test:browser": "turbo run test:browser",
    "test:e2e": "turbo run test:e2e --filter=@enterprise-agentic-saas/web",
    "test:eval:agent": "turbo run test:eval:agent --filter=@enterprise-agentic-saas/agent",
    "test:e2e:full": "turbo run test:e2e:full --filter=@enterprise-agentic-saas/web"
  }
}
```

| スクリプト        | 主な対象                                        | 外部費用                          |
| ----------------- | ----------------------------------------------- | --------------------------------- |
| `test`            | Node、happy-dom、libSQL、Elysia、台本付きモデル | なし                              |
| `test:browser`    | Storybook、Vitest Browser Mode、W6              | なし                              |
| `test:e2e`        | 決定的E2EのE1                                   | なし                              |
| `test:eval:agent` | 実モデル評価のG5                                | LLM料金あり                       |
| `test:e2e:full`   | 完全E2EのE2                                     | LLMおよび外部provider料金あり得る |

`check`は静的検査と`test`を含みます。ブラウザー、E2E、有料テストは独立jobにします。

## 命名

| 接尾辞、配置            | 用途                                                   |
| ----------------------- | ------------------------------------------------------ |
| `.test.ts`、`.test.tsx` | Node、happy-dom、libSQL、軽量統合                      |
| `.browser.test.tsx`     | Storybookだけでは表現しにくいブラウザー機能統合        |
| `.stories.tsx`          | Storybookの状態、Controls、操作、a11y                  |
| `.spec.ts`              | W6またはE2EのPlaywrightテスト                          |
| `.visual.test.tsx`      | 将来の選択的な視覚回帰テスト                           |
| `test-support/**`       | productionからimportされない共有fixture、fake、builder |

## 非目標

- 全テストを一つの共通レベルへ統一しない
- assertion数やcoverage値を目的化しない
- 全componentへ機械的にstoryまたはbrowser testを作らない
- 全API routeを実HTTPで重複検査しない
- 全Agent安全性を実LLM評価へ委ねない
- 全storyを視覚回帰テストへ含めない
- 完全E2Eを通常PRで実行しない
