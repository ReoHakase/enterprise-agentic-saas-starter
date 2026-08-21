---
title: apps/agentの設計
status: accepted
implementation: active
last_reviewed: 2026-08-20
applies_to:
  - apps/agent/**
---

# apps/agentの設計

## 目次

- [責務](#責務)
- [srcmastraへの集約](#srcmastraへの集約)
- [目標構造](#目標構造)
- [依存方向](#依存方向)
- [tool構造](#tool構造)
- [model injection](#model注入)
- [test専用Worker](#テスト専用worker)
- [import境界](#import-boundary)
- [テスト配置](#テスト配置)
- [理由と代償](#理由と代償)
- [受入条件](#受入条件)

## 責務

`apps/agent`はMastra agent、model selection、tool orchestration、stream projection、usage normalization、stop conditionを所有します。tenant data、Auth table、R2、business transactionの正本はAPIです。

## src/mastraへの集約

手書きruntime codeは`apps/agent/src/mastra/**`へ全面移動します。

例外:

- generated `src/cloudflare-env.d.ts`
- package rootのconfig、script、test result

旧`src/runtime/**`、`src/tools/**`、`src/messages/**`などを並行して残しません。移行後は`src/mastra/**`だけがhand-written runtime rootです。

理由:

- Mastra StudioとWorkerが同じcompositionをloadする
- Agent固有codeの探索範囲を一か所へ閉じる
- import ruleを`src/mastra/**`へ確実に適用する
- legacy zoneを除外してgateが緑になる状態を防ぐ

## 目標構造

```text
apps/agent/src/
  cloudflare-env.d.ts
  mastra/
    index.ts
    worker.ts

    composition/
      create-product-agent.ts
      create-runtime.ts

    agents/
      product-agent/
        agent.ts
        instructions.ts
        memory.ts
        memory-persistence-guard.ts
        tools.ts
        skills/

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

    adapters/
      control-plane/
      model/
      telemetry/

    test-support/
      scripted-model.ts
      fake-control-plane.ts
      fixtures.ts

    e2e/
      worker.ts
      scripted-scenarios.ts

```

`index.ts`はMastra Studioのentrypoint、`worker.ts`はproduction Cloudflare Worker entrypointです。
`memory-persistence-guard.ts`は標準`MessageHistory`を公開形式へ変換する層ではありません。toolの
`toModelOutput`で現在のturnへ渡した生のメディアが`providerMetadata.mastra.modelOutput`へ複製された
場合に、その副本だけを保存前に除去します。それ以外のprovider metadata、ツール入力・出力、
`file`・`source`類、live streamは変更しません。

## 依存方向

```text
worker/composition
  -> agents/runtime/tools/adapters

agents
  -> runtime/core/tool definitions

runtime
  -> core/ports

execute.ts
  -> core/ports

tool.ts
  -> factories.ts + execute.ts

factories.ts
  -> agent-contracts + Mastra createTool

adapter
  -> port + provider SDK

core/ports
  -> Mastra、OpenRouter、API concrete clientを知らない
```

`apps/agent`は`@enterprise-agentic-saas/api/agent-client`をimportしません。control-plane adapterは
`agent-contracts`の直列化contractとlocal portを使ってService Bindingへrequestを送り、agent、runtime、
tool executorはconsumer-owned portへ依存します。

## tool構造

- `schema.ts`: modelに公開するinput contract
- `execute.ts`: Mastra非依存のapplication logic
- `factories.ts`: 共有Valibot schemaとexecutorをMastra `createTool`へ接続するAgent-local factory
- `tool.ts`: runtime port、grant、budget、Approvalをfactoryへ接続するcomposition

この分割により、tool safety、call order、quota、output projectionをreal LLMなしでtestできます。

`execute.ts`はMastra、model provider、API concrete clientをimportしません。処理順序を
`validate -> authorize -> reserve idempotency -> write -> record usage -> bounded projection`へ固定し、
各境界をportで観測可能にします。`factories.ts`はschemaとexecutorを`createTool`へつなぎ、`tool.ts`は
runtime contextとfactoryをcomposeします。API MCPはこのfactoryをimportしません。

public Web research agent/toolはtenant data、write tool、private control-plane portへ依存しません。
一般化済みqueryだけを受け取る別compositionとし、同じAgentに「promptで使わないよう指示した」
だけの分離は採用しません。

## model注入

agent factoryはmodelをdependencyとして受け取ります。

```ts
export type ProductAgentDependencies = {
  model: LanguageModel
  tools: ProductTools
  clock: Clock
  ids: IdGenerator
}
```

production compositionだけがOpenRouter adapterを渡します。environment variableでproduction modelとscripted modelを切り替えません。
Agent定義自身はOpenRouter等のconcrete model providerを選びません。

Mastra Studioとproduction Workerは同じproduct compositionをloadします。Studio専用entrypointの
`src/mastra/index.ts`だけが、tenantに紐づかないProduct Agentのmodel解決をcomposition引数で
明示的に許可します。この許可は`NODE_ENV=development`とのAND条件で、productionでは同じ
entrypointを読み込んでもfail closedにします。この経路ではbusiness toolを1件も公開せず、
Application DBとAuthへ到達できないようにし、tenant会話を保持するMemoryもAgentへ接続しません。production Workerの
entrypointはこの引数を渡さず、`RequestContext`の実行`capability`を常に必須にします。

Studio専用のagent、mock tool、固定credentialは作りません。Vitestはagent factoryへ
`scripted model`を直接注入できます。Workerとして実行するときだけ別E2E entrypointへ注入し、
production Workerや環境変数から選べるmodel切替は作りません。

## テスト専用Worker

free full-stack E2Eでは別entrypointを使います。

```text
wrangler.jsonc
  main = src/mastra/worker.ts

wrangler.e2e.jsonc
  main = src/mastra/e2e/worker.ts
```

Worker entrypointのうち`e2e/worker.ts`だけが`test-support/scripted-model.ts`をimportします。
Vitestはtest fileからtest-supportを直接importしてfactoryへ渡せます。

安全条件:

- production `worker.ts`から`e2e/**`と`test-support/**`へimport pathがない
- public routeやproduction envでmodelを切り替えられない
- production dry-run bundleにscripted modelのsentinelが含まれない
- CIの一時Service BindingだけがE2E Workerを参照する
- production deploy configが`wrangler.e2e.jsonc`を参照しない

## import boundary

許可するworkspace import:

```text
@enterprise-agentic-saas/agent-contracts
```

禁止:

```text
@enterprise-agentic-saas/db/**
@enterprise-agentic-saas/auth/**
@enterprise-agentic-saas/email/**
@enterprise-agentic-saas/ui/**
@enterprise-agentic-saas/api/client
apps/web/**
```

`core/**`と`runtime/ports.ts`から`@mastra/*`、`@openrouter/*`、OpenTelemetry concrete SDKを禁止します。
`agents/**`、`runtime/**`、`tools/**/execute.ts`からAPI concrete clientも禁止します。

## テスト配置

- core/tool executor: `bun run test`
- scripted model loop: `bun run test`
- Agent-owned control-plane port contract: `bun run test`
- private API + temporary DB integrationはAPI-owned `bun run test`
- real model dataset eval: `bun run test:eval:agent`
- full paid browser canary: `bun run test:e2e:full`

## 理由と代償

### 理由

- real LLMなしでAgent loopをdeterministicに検証できる
- production model切替面を増やさない
- Mastraに関するcodeを一つのrootへ集約する
- tool executorをframeworkから隔離する

### 代償

- production WorkerとE2E Workerの二entrypointを管理する
- portとadapterのfileが増える
- Mastra SDK upgrade時にtool adapter層を更新する必要がある

安全なtest injectionとproduction isolationのために受け入れます。

## 受入条件

- hand-written Agent runtimeが`src/mastra/**`外に残らない
- production bundleにtest-supportが入らない
- AgentからDB/Auth/Email importがない
- tool executorがMastraなしでtest可能
- scripted model integrationが`bun run test`で実行される
- API packageとprivate appをsource importせず、`agent-contracts`とService Bindingだけを使う
