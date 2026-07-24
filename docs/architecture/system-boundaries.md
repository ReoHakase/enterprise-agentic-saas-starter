---
title: システム境界とworkspace依存
status: proposed
implementation: planned
last_reviewed: 2026-07-24
---

# システム境界とworkspace依存

## 目次

- [目的](#目的)
- [workspace graph](#workspace-graph)
- [許可する依存](#許可する依存)
- [禁止する依存](#禁止する依存)
- [公開entrypoint](#公開entrypoint)
- [test-support](#test-support)
- [importの表記](#importの表記)
- [強制方法](#強制方法)
- [理由と代償](#理由と代償)
- [受入条件](#受入条件)

## 目的

workspace間のdependency directionを固定し、private implementationの移動がmonorepo全体の破壊的変更にならないようにします。

## workspace graph

```text
apps/web
  -> @enterprise-agentic-saas/api/client
  -> @enterprise-agentic-saas/auth/client
  -> @enterprise-agentic-saas/ui/*

apps/api
  -> @enterprise-agentic-saas/auth
  -> @enterprise-agentic-saas/db
  -> @enterprise-agentic-saas/email

apps/agent
  -> @enterprise-agentic-saas/api/agent-client

apps/github-emulator
  -> @enterprise-agentic-saas/auth/github-oauth

packages/auth
  -> @enterprise-agentic-saas/db
  -> @enterprise-agentic-saas/email

packages/db
packages/email
packages/ui
packages/typescript-config
  -> 他workspaceへ依存しない
```

## 許可する依存

### apps

- appは必要なpackageのpublic entrypointへ依存できる
- app同士のruntime連携はHTTP、Service Binding、公開package contractを使う
- appから別appのsource fileをimportしない

### packages

- packageからappへ依存しない
- package間依存は明示された例外だけにする
- `packages/auth`からDBとEmailへの依存はBetter Auth callbackのcompositionに必要なため許可する
- `packages/email`からAuthへの逆依存は禁止する

## 禁止する依存

| importer | 禁止 |
| --- | --- |
| `apps/web` | DB、Email、Agent runtime、API server内部 |
| `apps/api` | Web、Agent runtime、UI、GitHub emulator |
| `apps/agent` | DB、Auth、Email、Web、API public client |
| `apps/github-emulator` | API、Agent、DB、Email、UI |
| `packages/auth` | app、API、UI |
| `packages/db` | 他の全workspace |
| `packages/email` | app、Auth、DB、UI、API |
| `packages/ui` | app、API、Auth、DB、Email、Agent |

## 公開entrypoint

workspaceを越えるimportは`package.json#exports`に限定します。

```ts
import { createApiClient } from "@enterprise-agentic-saas/api/client"
import type { Db } from "@enterprise-agentic-saas/db"
```

禁止例:

```ts
import { internalSchema } from "../../packages/db/src/schema/app"
import { privateService } from "@enterprise-agentic-saas/api/src/modules/example/service"
```

`exports`はdocumentationだけでなく、runtimeからprivate pathを到達不能にするboundaryです。

## test-support

`test-support`はproduction entrypointからimportしません。

許可:

```text
*.test.ts
*.test.tsx
*.stories.tsx
apps/agent/src/mastra/e2e/**
Playwright fixture
```

禁止:

```text
production worker
production route
package public entrypoint
runtime adapter
```

Agentのscripted modelは別のE2E Worker entrypointだけからimportし、production Workerへenvironment switchを追加しません。

## importの表記

- 同じfeature/module内部はrelative import
- 別feature/moduleはpublic `index.ts`または`public.ts`
- 別workspaceはpackage name
- app routeからfeature private fileをdeep importしない

absolute aliasを同じfeature内部で多用すると、cross-feature deep importとの区別がつかなくなるためです。

## 強制方法

| 制約 | 手段 |
| --- | --- |
| workspace public surface | `package.json#exports` |
| 文字列としての禁止import | Oxlint `no-restricted-imports` |
| cycle | Oxlint `import/no-cycle` |
| undeclared/unused dependency | Knip |
| resolved path zone | architecture check script |
| package graph | Turborepo、Knip、architecture check |

Oxlintだけでresolved pathを完全には判定できないため、critical boundaryは独自architecture checkも実行します。

## 理由と代償

### 理由

- refactorの影響範囲をworkspace内へ閉じる
- browser bundleへserver codeが入ることを防ぐ
- Agentのtenant data accessをprivate APIへ限定する
- packageをruntime-independentに保つ

### 代償

- public entrypointとadapterが増える
- 同じ型をWeb-local schemaへ写像する場合がある
- cross-feature reuseには明示的なpublic surfaceが必要

この追加作業は、隠れたcouplingを早期に可視化するために受け入れます。

## 受入条件

- packageからappへのimportがゼロ
- WebがAPI server schemaをdeep importしない
- AgentがDB/Auth/Emailをimportしない
- test-supportがproduction bundleに入らない
- Knip strict modeでworkspace isolation findingがゼロ
