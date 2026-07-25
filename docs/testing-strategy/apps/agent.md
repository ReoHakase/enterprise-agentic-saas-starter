---
title: Product Agentテスト戦略
status: accepted
implementation: active
last_reviewed: 2026-07-26
applies_to:
  - apps/agent/**
  - apps/api/src/modules/agent/**
related:
  - ../e2e.md
---

# Product Agentテスト戦略

## 目的

Product Agentでは、決定的な安全性と、実モデルに依存する確率的な振る舞いを分離します。

安全性、tenant、capability、approval、idempotency、stream、usage、secret非漏洩は実LLMなしで検証します。実モデル評価はtool selection、context selection、safe refusalなど、モデル挙動そのものへ限定します。

## コード構造との対応

```text
apps/agent/src/mastra/
  core/
    messages/
    policy/
    budget/
    usage/
    stop-conditions/

  runtime/
    ports.ts
    run-agent.ts
    resume-action.ts
    settlement.ts

  tools/
    <tool>/
      schema.ts
      execute.ts
      tool.ts
      execute.test.ts

  agents/
    product-agent.ts
    public-web-research-agent.ts

  adapters/
    model/
    control-plane/
    telemetry/

  test-support/
    scripted-model.ts

  composition/
  e2e/
  evals/
  skills/
  workflows/
  legacy/
  index.ts
  server.ts
  worker.ts
```

依存方向:

```text
core
  → framework非依存

runtime
  → core
  → ports

tool execute
  → core
  → ports

tool adapter
  → Mastra
  → execute

adapters
  → ports
  → provider SDK

composition
  → runtime
  → adapters
  → agents
```

禁止:

- AgentからDB、Auth、Email、UIへ直接依存する
- public API clientを使う
- tool executorからMastra、OpenRouter、Sentryをimportする
- coreからprovider SDKをimportする
- Public Web Research Agentへtenant write toolを登録する

## テスト層

| 名前                                 | Testing Trophy 分類 | テスト内容                                                                                                                                                                                                                                                                                                                                                                                                                                          | 実物として使うもの                                                                       | 差し替えるもの                                                                      | 対象コード/ファイル                                                                                                | Test Runner              | 実行速度           | CI時間課金以外の費用 | 量                               |
| ------------------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------ | ------------------ | -------------------- | -------------------------------- |
| **Agent中核単体テスト (G1)**         | 単体                | <ul><li>canonical message、stream part、context budget、stop conditionを確認する</li><li>usage normalisation、pricing projection、retry classificationを確認する</li><li>privacy scrubがsecret、private field、unexpected valueを除去することを確認する</li><li>submission identity、grant parse、state transitionを境界値ごとに確認する</li></ul>                                                                                                  | coreの純粋function、schema、policy                                                       | clock、ID、pricing table、random                                                    | `apps/agent/src/mastra/core/**`、pure policy、usage、message codec                                                 | Vitest Node              | 極めて速い         | なし                 | 非常に多い                       |
| **Agentツール実行単体テスト (G2)**   | 単体                | <ul><li>tool input schemaがunknown property、private field、過大inputを拒否することを確認する</li><li>validate、authorize、reserve、perform、settle、projectの順序を確認する</li><li>拒否時にprovider、DB、quota reservationを呼ばないことを確認する</li><li>abort、timeout、idempotency、bounded output、安全なerror projectionを確認する</li><li>薄いMastra wrapperがID、description、schema、request contextを正しく渡すことを確認する</li></ul> | tool schema、`execute.ts`、薄い`tool.ts` wrapper                                         | control-plane port、provider、quota、clock、logger                                  | `apps/agent/src/mastra/tools/**/schema.ts`、`execute.ts`、`tool.ts`                                                | Vitest Node + fake ports | 極めて速いから速い | なし                 | 多い                             |
| **Agent決定的ループ統合テスト (G3)** | 統合                | <ul><li>text response、single tool、sequential tool、tool result後の続行を確認する</li><li>approvalで停止し、承認後に正しい位置からresumeすることを確認する</li><li>malformed input、tool error、step limit、abort、disconnectを確認する</li><li>canonical stream part、tool order、usage、finish reason、reload projectionを確認する</li><li>実LLMを使わず、同じscenarioから同じ結果になることを確認する</li></ul>                                 | Agent runtime、実tool adapter、stream projector、台本付きモデル                          | modelはscripted、tool side effectはcontrolled fakeまたはrecording implementation    | `apps/agent/src/mastra/runtime/**`、`agents/**`、Agent factory、stream、approval、`test-support/scripted-model.ts` | Vitest + scripted model  | 速いから中         | なし                 | 厚くする                         |
| **Agent制御面統合テスト (G4)**       | 統合                | <ul><li>connection ticket、run grant、expiry、epoch rotation、run ownershipを確認する</li><li>private API経由のtool execution、approval、resume ticketを確認する</li><li>current membership再検証とcross-tenant non-disclosureを確認する</li><li>DB persistence、canonical reload、usage event、failed settlementを確認する</li><li>Agent WorkerとAPI control planeの本番contractが接続できることを確認する</li></ul>                               | Agent runtime、実tool executor、private Elysia app、実libSQL、Service Binding相当adapter | modelはscripted、external providerはfake、browserは使わない                         | `apps/agent/src/mastra/adapters/control-plane/**`、`composition.ts`、`worker.ts`、`apps/api/src/modules/agent/**`  | Vitest + Elysia + libSQL | 中から遅い         | なし                 | 必要な範囲で厚くする             |
| **Agent実モデル挙動統合評価 (G5)**   | 統合                | <ul><li>自然文から必要なtoolを選び、不要または禁止されたtoolを選ばないことを評価する</li><li>tool inputがschema-validでprivate queryを含まないことを評価する</li><li>approval requirement、context selection、image tool selection、safe refusalを評価する</li><li>最大tool call数とstep数以内に終了することを評価する</li><li>deterministic gateと任意のquality scorerを分離する</li></ul>                                                         | 実LLM、実system instruction、実tool schema、実model settings                             | tool implementation、DB write、request contextはcontrolled synthetic implementation | `apps/agent/evals/**`、prompt、tool schema、model adapter、behaviour fingerprint対象file                           | VitestまたはMastra eval  | 遅い               | LLM料金あり          | 小さく管理された評価データセット |

## G1: Agent中核単体テスト

framework、provider、networkを使いません。percentage coverageより、次のsecurity caseを優先します。

- secretがnested causeへ入る
- unexpected stream part
- usageがnegative、NaN、overflow
- budgetちょうど、直前、超過
- abortとsettlementの競合
- unknown finish reason
- stale grant

## G2: Agentツール実行単体テスト

各toolを次の形へ分けます。

```text
schema.ts
  modelへ公開するinput contract

execute.ts
  Mastra非依存のapplication logic

tool.ts
  executeをMastraへ接続する薄いadapter
```

executorの拒否testでは結果だけでなく、副作用portのcall countがゼロであることを確認します。

## G3: Agent決定的ループ統合テスト

scripted modelは、次をscenario IDごとに決定的に返します。

- text
- tool call
- tool result後の続行
- finish reason
- malformed part
- provider error

自然言語全文をassertしません。tool名、input、順序、approval、stream marker、usage、finish reasonをassertします。

## G4: Agent制御面統合テスト

G4はbrowser、実LLM、Cloud Tursoを使いません。APIとAgentのprivate boundaryを最も安価に保証する層です。

一つのcaseが長くなった場合は次を先に行います。

- migration済みtemplate DBをcopyする
- suite単位でapp factoryを再利用する
- fixtureを小さくする
- unrelated Agent scenarioをG3へ下げる

## G5: Agent実モデル挙動統合評価

G5はブラウザーなしの実モデル挙動評価を唯一所有し、E2E文書へ重複分類しません。

### deterministic gate

- required toolが呼ばれた
- forbidden toolが呼ばれていない
- input schemaがvalid
- approval前のwriteがない
- private queryがない
- max step以内
- expected refusalが行われた

### optional scorer

- answer completeness
- source usefulness
- intent alignment
- explanation clarity

Gate failureは必ずfailureです。scorerはthresholdとsample reviewを持ちます。安全性をLLM judgeだけへ委ねません。

### behaviour fingerprint

次のhashが変わった場合だけPRでG5 smokeを候補にします。

- Agent instruction
- model ID、settings
- tool schema
- approval policy
- stream protocol
- Agent core、runtime、tools
- API agent control-plane contract

UI-only変更ではG5を実行しません。

### trial

- PR smoke: critical itemを少数、各1 trial
- nightly: 全評価データセット、各1 trial
- release: 重要itemを複数trial

providerの429、5xxはinfrastructure failureとして分離します。モデル挙動failureをretry成功で隠しません。

## E2Eとの境界

```text
G5
  実モデル挙動をbrowserなしで評価する

E1
  scripted modelで全workspace配線を決定的に確認する

E2
  実モデルを含む本番相当の最終疎通を確認する
```

E2で見つかったmodel behaviour不具合は、可能ならG5 datasetへ回帰itemとして追加します。配線不具合はG4またはE1へ下げます。

## 実行

```json
{
  "scripts": {
    "test": "vitest run",
    "test:eval:agent": "vitest run --config vitest.eval.config.ts"
  }
}
```

`test:eval:agent`はAPI keyがない場合に黙ってpassしません。local optional runでは明示skip理由、required release runではconfiguration failureにします。

## 受入条件

- core、runtime、tool executor、adapterの依存方向が明確である
- 全toolにschema、executor、wrapperの境界がある
- 実LLMなしでmulti-step Agent loopを検査できる
- private control planeをscripted modelで統合検査できる
- G1からG4が通常`test`へ含まれる
- ブラウザーなしの実モデル評価をG5だけが所有する
- deterministic safetyをLLM judgeへ委ねない
- UI-only変更で有料評価を実行しない
