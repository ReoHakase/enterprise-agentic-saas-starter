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
- [test codeの境界](#test-codeの境界)
- [importの表記](#importの表記)
- [browserとside-effect import](#browserとside-effect-import)
- [強制方法](#強制方法)
- [Oxlintで表現できない制約](#oxlintで表現できない制約)
- [理由と代償](#理由と代償)
- [受入条件](#受入条件)

## 目的

workspace間のdependency directionを固定し、private implementationの移動がmonorepo全体の破壊的変更にならないようにします。

## workspace graph

次の図はproduction/test sourceから解決されるworkspace importの**完全なallowlist**です。
図にないruntime/source edgeは、同じpackageがmanifest上で解決できても禁止します。

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

これはruntime/source graphであり、build/test用toolingのmanifest graphとは分けます。各workspaceが
`@enterprise-agentic-saas/typescript-config`を`devDependency`に置き、`tsconfig.json`の
`extends`で利用することは許可します。ただしsourceから同packageをimportせず、Knipの
workspace isolationはruntime dependency、development dependency、source importを区別して
検査します。Oxlint、Vitest、Storybook等のtooling dependencyも同様に、実行するworkspaceの
`devDependency`として宣言します。

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
| `apps/web` | DB、Email、Agent runtime、GitHub emulator、`api/client`以外のAPI、`auth/client`以外のAuth |
| `apps/api` | Web、Agent runtime、UI、GitHub emulator |
| `apps/agent` | DB、Auth、Email、Web、UI、GitHub emulator、`api/agent-client`以外のAPI |
| `apps/github-emulator` | Web、API、Agent、DB、Email、UI |
| `packages/auth` | app、API、UI |
| `packages/db` | 他の全workspace |
| `packages/email` | app、Auth、DB、UI、API |
| `packages/ui` | app、API、Auth、DB、Email、Agent |
| `packages/typescript-config` | runtime sourceと全workspace dependency |

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
feature/moduleの`index.ts`または`public.ts`、workspaceの`package.json#exports`、
`no-restricted-imports`、resolved-path architecture checkは同じ公開面を表します。公開面を変更する
ときは4つとexport-surface fixture testを同じPRで更新し、private directoryをwildcardで
再exportしません。

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

## test codeの境界

test、story、E2E、fixtureはcomplexityとsize budgetだけをproductionより緩めます。次の境界は
productionと同じか、より厳しくします。

- workspace dependency direction
- package public entrypointとdeep import禁止
- domain/application/platformの依存方向
- browser/server module分離
- productionから`test-support`への依存禁止
- AgentからDB/Auth/Email/Webへの依存禁止

testを理由にprivate implementationへdeep importすると、public contractではなく配置を固定して
refactorを妨げるためです。white-box unit testが必要なpure helperはowner module内へcolocateし、
workspace外へ公開しません。

## importの表記

- 同じfeature/module内部はrelative import
- 別feature/moduleはpublic `index.ts`または`public.ts`
- 別workspaceはpackage name
- app routeからfeature private fileをdeep importしない

absolute aliasを同じfeature内部で多用すると、cross-feature deep importとの区別がつかなくなるためです。

`import/no-relative-parent-imports`は全体へ有効化しません。同じfeature/module内の
`../model`のような正当なimportまで禁止するためです。cross-featureとcross-workspaceの境界は
public entrypointとresolved pathで検査します。

## browserとside-effect import

browser entrypointではNode builtin、`next/headers`、`next/server`、`server-only`、server adapterを
禁止します。`import/no-nodejs-modules`とpath規則を併用します。Oxlintは`"use client"`というfile内容を
selectorにできないため、`*.client.tsx`、client専用directory、browser package entrypointという
配置規約で対象を決めます。

side-effect importは次の狭いallowlistだけを許可します。

- CSS
- `server-only`
- `client-only`
- test setupとして明示したfile

telemetry、polyfill、provider登録を暗黙のside effectで注入せず、composition rootから明示的に
初期化します。

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

`no-restricted-imports`のoverride配列は親設定へ追加ではなく置換されます。workspace設定は
共通helperからworkspace禁止patternとlayer禁止patternを合成し、どちらか一方を落としません。
このhelperのworkspace patternは上記allowlistから生成し、手書きの別一覧を正本にしません。
architecture checkも同じallowlistを読み、代表fixtureで全許可edge、graph外edge、package deep
import、type-only importを検査します。新workspaceまたはentrypointを追加するPRではallowlist、
`package.json#exports`、fixtureを同時に更新します。

`import/no-cycle`は全depth、`ignoreExternal: false`、`ignoreTypes: true`で開始します。type-only
cycleはruntime初期化cycleを起こさず、移行時のnoiseを抑えられるためです。ただしtypeの設計cycleも
public surface、Knip、architecture reviewで確認します。

## Oxlintで表現できない制約

文字列patternだけでは次を完全には判定できません。

- aliasやpackage exportを解決した実体path
- 同じaliasに見えるsame-featureとcross-feature import
- computed dynamic import
- `"use client"` directiveを持つfileだけへの規則
- production entrypointからtest supportへ至る間接依存

Rust regexのlookaroundや未安定なJS pluginへcritical boundaryを依存させません。
`bun run check:architecture`がTypeScript/Bun resolution後のgraphを検査し、Oxlintは即時feedbackを
担当します。

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
- runtime/source graph外のworkspace edgeがfixtureを含めて全て拒否される
- TypeScript config等のtooling dependencyがruntime graphへ混入しない
