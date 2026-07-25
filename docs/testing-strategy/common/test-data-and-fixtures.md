---
title: テストデータとfixture仕様
status: accepted
implementation: active
last_reviewed: 2026-07-26
applies_to:
  - apps/**
  - packages/**
---

# テストデータとfixture仕様

## 目的

テストデータを決定的、追跡可能、隔離可能にし、実利用者データ、秘密情報、共有mutable stateをテストへ持ち込まないようにします。

## 基本原則

- 全fixtureはsynthetic dataを使う
- clock、timezone、locale、UUID、random seedを固定する
- 同じseedとscenario IDから同じデータを生成する
- domain上重要な代表ケースは明示的な定数fixtureとして保つ
- 大量の非本質的fieldは決定的生成libraryで埋める
- relation、開始時刻と終了時刻、状態遷移など複数field制約はbuilderで生成する
- production、remote Turso、remote R2、実OAuth providerを通常テストから拒否する
- 実email、token、cookie値、provider raw responseをartifactへ保存しない

## fixtureの層

```text
primitive fixture
  ID、clock、name、email、URL

package fixture
  DB row、auth user、UI props、email input

feature fixture
  Issue、Organization、Agent thread

scenario fixture
  approval付きwrite、upload、reload
```

下位fixtureから上位fixtureを組み立てます。上位scenarioをpackage testへ逆流させません。

## builderと固定fixture

### builderを使うもの

- 大量のrow
- 非本質的なname、email、avatar、timestamp
- optional fieldの組合せ
- relation graph
- pagination dataset
- concurrency用namespace

### 明示的な固定fixtureを使うもの

- permission matrixの代表row
- tenant境界
- approval required
- migration前後のlegacy row
- security regression
- 手動QAで参照する評価用row
- Storybookの状態カタログ

## test-support境界

- `test-support/**`はproduction sourceからimportしない
- packageのtest-supportを別workspaceのproduction codeからimportしない
- cross-workspace fixture共有はpublicなtest-support subpathを明示した場合だけ許可する
- application-specific fixtureを`packages/db`や`packages/ui`へ置かない
- fakeは実interfaceまたはportを実装する
- fake DSLが本番Drizzle queryやEden APIと異なる場合、SQLまたはHTTP correctnessの証明に使わない

## namespaceと並列実行

E2E、DB、R2、OAuth emulatorでは次をnamespaceへ含めます。

```text
runId
workerId
testId
organizationId
userId
databasePath
R2 prefix
OAuth state namespace
```

cleanupは全state削除ではなくnamespace単位にします。テスト失敗時にも後続テストへ共有状態を残さないよう、所有者とcleanup順序を明示します。

## MSW fixture

- API成功bodyはEden由来型を`satisfies`する
- status別error bodyをtyped response factoryで生成する
- story fileへ大きなJSONを直接書かず、featureの`test-support.ts`またはcomponent directoryの`fixtures.ts`へ置く
- success、empty、validation error、not found、conflict、server error、network errorを明示的に分ける
- stateful handlerはcall countをtestごとにresetする

## Agent fixture

- scripted modelはtext、tool call、tool result後の続行、finish reasonを決定的に返す
- tool input、tool order、approval state、stream part、usage、finish reasonをassert可能にする
- 実モデル評価用datasetはsynthetic request contextだけを使う
- provider response全文、prompt全文、private payloadを保存しない

## migration fixture

- historical stateは原則としてmigration tagまでのprefixを適用して作る
- raw baseline SQLはmigration履歴で再現できない状態だけに限定する
- legacy rowの意図と期待するbackfillをfixture名で表す
- migration追加のたびに一fileを増やさず、fresh、upgrade、invariant、concurrency、lifecycleという関心で整理する

## artifact

無料テストの失敗時に保存できるもの:

- bounded log
- HTML report
- screenshot
- trace
- video
- coverage report
- synthetic fixture ID

有料実モデルテストで保存できるもの:

- scenario ID
- pass/fail
- tool名
- bounded error code
- duration
- usage aggregate
- run ID

有料テストではprompt全文、provider raw response、private tool payload、private DOM snapshot、video、trace、screenshotを原則保存しません。
