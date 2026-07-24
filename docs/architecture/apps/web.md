---
title: apps/webの設計
status: proposed
implementation: planned
last_reviewed: 2026-07-24
applies_to:
  - apps/web/**
---

# apps/webの設計

## 目次

- [責務](#責務)
- [目標構造](#目標構造)
- [app directory](#app-directory)
- [feature](#feature)
- [serverとclient](#serverとclient)
- [controllerとview](#controllerとview)
- [portとadapter](#portとadapter)
- [componentとstory](#componentとstory)
- [import境界](#import-boundary)
- [テスト配置](#テスト配置)
- [理由と代償](#理由と代償)
- [受入条件](#受入条件)

## 責務

`apps/web`はNext.js routing、RSC、domain-specific UI、browser state、Eden client、Agent stream UIを所有します。DB、Email、Agent model runtimeは所有しません。

## 目標構造

```text
apps/web/
  app/
    (public)/
    (console)/
    api/
    layout.tsx

  components/
    providers.tsx
    console-shell.tsx
    route-error.tsx

  features/
    <feature>/
      index.ts
      model.ts
      schema.ts
      api.ts
      queries.ts
      use-<feature>-controller.ts
      server.tsx
      components/
        <feature>.tsx
        <feature>.test.tsx
        <feature>.stories.tsx
      test-support.ts

  lib/
    client/
    server/
    shared/

  e2e/
  test/
```

大きいfeatureだけ`model/`、`adapters/`、`components/<component>/`へ昇格します。全featureへ空directoryを作りません。

## app directory

`app/`はcomposition rootです。

許可:

- route param
- RSC data loading
- session check
- metadata
- redirect、not found
- feature public entrypointのcomposition

禁止:

- domain rule
- reusable mutation implementation
- feature private componentのdeep import
- 大規模なClient Component

route fileを薄く保つと、Next.js file conventionとproduct logicを分離できます。

## feature

feature rootの責務:

| file | 責務 |
| --- | --- |
| `model.ts` | pure state、view model、reducer |
| `schema.ts` | Web-local runtime validation |
| `api.ts` | Eden client adapter |
| `queries.ts` | TanStack Query options |
| `use-*-controller.ts` | side effectとview stateの接続 |
| `server.tsx` | RSC loaderとserver composition |
| `index.ts` | feature外へ公開する最小surface |

Web-local schemaはAPI transport typeの代用品ではありません。untrusted responseをUIへ表示する直前のruntime boundaryとして使います。

`model.ts`、reducer、view-modelはReact、Next.js、TanStack Query、router、toast、API client、
`fetch`、`useChat`、browser APIをimportしません。別featureから利用できるのは`index.ts`が
明示exportしたcontractだけで、`components/`、`queries.ts`、`api.ts`を公開面へ流しません。

## serverとclient

- server codeは`server.tsx`、`lib/server/**`、`*.server.ts`へ置く
- browser codeは`*.client.tsx`、controller、component、`lib/client/**`へ置く
- browserから`next/headers`、server env、server-only moduleをimportしない
- RSCはinitial dataとauthorizationを担当し、interactive stateはClient Componentへ渡す

RSCを第一のcontainerとみなし、旧来の全data fetchingをClient Componentへ集めません。

## controllerとview

単純なcomponentは一fileでよいです。次の条件を満たす場合だけ分割します。

```text
feature.client.tsx
use-feature-controller.ts
feature-view.tsx
```

分割条件:

- Query/mutation/router/toast/streamが複数ある
- function size budgetを超える
- Storybookでview stateを独立させたい
- side effectのraceやcancelをunit testしたい

`view`は`apiClient`、Query、mutation、router、toast、`fetch`、`useChat`、chat transportを
直接importせず、stateとactionをpropsで受けます。

複数のasync state、cancel、approval、stream resumeが絡むflowはbooleanを増やさず、
discriminated unionまたはreducer/state machineへ移します。これにより不可能なstateを型で消し、
raceと復元をpure testで再現できます。

## portとadapter

Webでportを作るのは、複雑なfeatureがtest時に明確な差し替えを必要とする場合だけです。

例:

```ts
export type NotificationPort = {
  error(message: string): void
}
```

単純なAPI wrapperを全てinterface化しません。`api.ts`や`queries.ts`で十分な場合はportを作りません。
Sonner、router、Agent transportの具体実装はcontrollerまたはclient compositionで注入し、
pure model/viewから暗黙のsingletonとして参照しません。

## componentとstory

基本形:

```text
feature-panel.tsx
feature-panel.test.tsx
feature-panel.stories.tsx
```

- `test.tsx`: happy-domでDOM contract
- `stories.tsx`: state catalogue、interaction、a11y、light/dark
- `browser.test.tsx`: real QueryClient、MSW、chat transportなどfeature integrationだけ
- `visual.test.tsx`: 現在は作らない

`dialog`、`light`、`dark`などStorybookのargと識別子は英語へ統一します。

## import boundary

許可:

```text
@enterprise-agentic-saas/api/client
@enterprise-agentic-saas/auth/client
@enterprise-agentic-saas/ui/*
```

禁止:

```text
@enterprise-agentic-saas/db/**
@enterprise-agentic-saas/email/**
@enterprise-agentic-saas/api/* ただし client を除く
@/features/<other-feature>/* private path
@/app/**
```

同じfeature内部はrelative importを使い、別featureは`@/features/<feature>`からimportします。

追加のlayer規則:

- `model.ts`からcomponent/controller/adapterをimportしない
- `view`から`api.ts`、`queries.ts`、router、toast、Agent transportをimportしない
- `lib/shared`から`lib/client`または`lib/server`へ依存しない
- app-wide `components/**`からdomain featureへ逆依存しない
- client pathからNode builtin、`next/headers`、`next/server`、`server-only`をimportしない
- `app/**`を再利用layerとしてfeatureからimportしない

```ts
// same feature: allowed
import { reduceDraft } from "../model"

// cross feature: allowed
import { IssueLink } from "@/features/issues"

// cross feature private path: forbidden
import { IssueLink } from "@/features/issues/components/issue-link"
```

## テスト配置

- pure model/schema/error mapping: `bun run test`
- component DOM/controller: `bun run test`
- story interaction/a11y: `bun run test:browser`
- feature browser integration: `bun run test:browser`
- RSC、routing、cookie、cross-origin: `bun run test:e2e`

## 理由と代償

### 理由

- RSCとClient Componentの責務が明確になる
- side effectをviewから分離し、Storybookとunit testを使いやすくする
- cross-feature couplingをpublic entrypointへ限定する

### 代償

- controller/view分割にpropsが増える
- Web-local schemaが追加される
- feature public surfaceの設計が必要になる

分割は条件付きにし、単純componentのceremonyを避けます。

## 受入条件

- `app/`に大規模なClient Componentがない
- viewからQuery/router/toast/API importがない
- browser codeからserver module importがない
- cross-feature deep importがない
- Storybookとtest fileが過剰分割されていない
