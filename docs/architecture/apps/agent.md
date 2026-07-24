---
title: apps/agentの設計
status: proposed
implementation: planned
last_reviewed: 2026-07-24
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
      product-agent.ts
      title-agent.ts
      public-web-research-agent.ts

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
  -> execute.ts + Mastra createTool

adapter
  -> port + provider SDK

core/ports
  -> Mastra、OpenRouter、API concrete clientを知らない
```

## tool構造

- `schema.ts`: modelに公開するinput contract
- `execute.ts`: Mastra非依存のapplication logic
- `tool.ts`: `execute.ts`をMastra `createTool`へ接続するadapter

この分割により、tool safety、call order、quota、output projectionをreal LLMなしでtestできます。

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

## テスト専用Worker

free full-stack E2Eでは別entrypointを使います。

```text
wrangler.toml
  main = src/mastra/worker.ts

wrangler.e2e.toml
  main = src/mastra/e2e/worker.ts
```

`e2e/worker.ts`だけが`test-support/scripted-model.ts`をimportします。

安全条件:

- production `worker.ts`から`e2e/**`と`test-support/**`へimport pathがない
- public routeやproduction envでmodelを切り替えられない
- production dry-run bundleにscripted modelのsentinelが含まれない
- CIの一時Service BindingだけがE2E Workerを参照する
- production deploy configが`wrangler.e2e.toml`を参照しない

## import boundary

許可するworkspace import:

```text
@enterprise-agentic-saas/api/agent-client
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

`core/**`と`runtime/ports.ts`から`@mastra/*`、`@openrouter/*`、Sentry concrete SDKを禁止します。

## テスト配置

- core/tool executor: `bun run test`
- scripted model loop: `bun run test`
- private API + temporary DB integration: `bun run test`
- real model dataset eval: `bun run test:eval:agent`
- full paid browser canary: `bun run test:e2e:agent`

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
