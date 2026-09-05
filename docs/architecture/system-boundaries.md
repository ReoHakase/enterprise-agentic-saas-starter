---
title: システム境界とworkspace依存
status: accepted
implementation: active
last_reviewed: 2026-09-05
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
  -> @enterprise-agentic-saas/agent-contracts
  -> @enterprise-agentic-saas/api/client
  -> @enterprise-agentic-saas/auth/client
  -> @enterprise-agentic-saas/ui/*

apps/api
  -> @enterprise-agentic-saas/agent-contracts
  -> @enterprise-agentic-saas/auth
  -> @enterprise-agentic-saas/db
  -> @enterprise-agentic-saas/email

apps/agent
  -> @enterprise-agentic-saas/agent-contracts

apps/images
  -> 他workspaceへ依存しない

packages/auth
  -> @enterprise-agentic-saas/db
  -> @enterprise-agentic-saas/email

packages/agent-contracts
packages/db
packages/email
packages/portless-topology
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

`packages/portless-topology`はローカル開発command専用のtooling packageです。各consumerは
manifestのdevelopment dependencyとbare executableだけを利用し、sourceからpackageをimportしません。
同packageは`package.json#bin`だけを公開し、`exports`と`main`を持ちません。

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

| importer                     | 禁止                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `apps/web`                   | DB、Email、Agent runtime、Emulate、`agent-contracts`以外のAgent package、`api/client`以外のAPI、`auth/client`以外のAuth |
| `apps/api`                   | Web、Agent runtime、UI、Emulate                                                                                         |
| `apps/agent`                 | API、DB、Auth、Email、Web、UI、Emulate                                                                                  |
| `apps/emulate`               | Web、API、Agent、DB、Email、UI                                                                                          |
| `apps/images`                | 他の全workspace                                                                                                         |
| `packages/auth`              | app、API、UI                                                                                                            |
| `packages/db`                | 他の全workspace                                                                                                         |
| `packages/email`             | app、Auth、DB、UI、API                                                                                                  |
| `packages/portless-topology` | 全workspaceのruntime/test source                                                                                        |
| `packages/ui`                | app、API、Auth、DB、Email、Agent                                                                                        |
| `packages/typescript-config` | runtime sourceと全workspace dependency                                                                                  |
| `packages/agent-contracts`   | app、DB、Auth、Email、UI                                                                                                |

## 公開entrypoint

workspaceを越えるimportは`package.json#exports`に限定します。CLI専用の
`packages/portless-topology`は例外的に`package.json#bin`だけを公開し、workspaceを越えるsource
importを全面的に禁止します。

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
`no-restricted-imports`、Knip strict、export-surface testは同じ公開面を表します。公開面を変更する
ときはこれらを同じPRで更新し、private directoryをwildcardで
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

Agentのscripted modelはVitest/test entrypointと別のE2E Worker entrypointだけからimportします。
production Workerへenvironment switchを追加しません。

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

`apps/web`の`@/*`はapplication sourceである`apps/web/src/*`だけへ解決します。workspace
rootに残すtest、E2E、Storybook、設定fileはこのaliasの対象へ含めません。

absolute aliasを同じfeature内部で多用すると、cross-feature deep importとの区別がつかなくなるためです。

`import/no-relative-parent-imports`は全体へ有効化しません。同じfeature/module内の
`../model`のような正当なimportまで禁止するためです。cross-featureとcross-workspaceの境界は
public entrypoint、`package.json#exports`、文字列としてのOxlint規則、Knip、build、code reviewで
検査します。

## browserとside-effect import

ブラウザーの入口ではNode.js組み込みモジュール、サーバー環境変数、サーバー側の`adapter`を
禁止します。OxlintはTanStack Startがサーバーとブラウザーへ分割した実体を解析しないため、
`*.client.tsx`、クライアント専用ディレクトリ、ブラウザーパッケージの入口という配置規約で対象を
決め、ViteとTypeScriptのビルド、コードレビューでサーバー側の辺がないことを確認します。

side-effect importは次の狭いallowlistだけを許可します。

- CSS
- `server-only`
- `client-only`
- test setupとして明示したfile

telemetry、polyfill、provider登録を暗黙のside effectで注入せず、composition rootから明示的に
初期化します。

## 強制方法

| 制約                                | 手段                           |
| ----------------------------------- | ------------------------------ |
| workspace public surface            | `package.json#exports`         |
| 文字列としての禁止import            | Oxlint `no-restricted-imports` |
| cycle                               | Oxlint `import/no-cycle`       |
| undeclared/unused dependency        | Knip                           |
| package graph / workspace isolation | Turborepo、Knip                |
| source配置                          | architecture文書とcode review  |

`no-restricted-imports`のoverride配列は親設定へ追加ではなく置換されます。workspace設定は
共通helperからworkspace禁止patternを生成します。新workspaceまたはentrypointを追加するPRでは
allowlist、`package.json#exports`、package manifestを同時に更新し、OxlintとKnipで検証します。
独自module resolverやimport graphは追加しません。

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
これらはpackage exports、production build、package-owned testとcode reviewで検証します。
repo専用module graph、architecture checker、ESLintは追加しません。

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
- Portless topologyがbare executable以外から参照されない
