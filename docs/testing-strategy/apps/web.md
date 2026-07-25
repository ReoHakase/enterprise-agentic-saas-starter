---
title: Webテスト戦略
status: accepted
implementation: active
last_reviewed: 2026-07-26
applies_to:
  - apps/web/**
related:
  - ../common/storybook.md
  - ../packages/ui.md
  - ../packages/auth.md
  - ../e2e.md
---

# Webテスト戦略

## 目的

Webでは、純粋な状態処理、DOM上のcomponent振る舞い、実ブラウザーのcomponent contract、feature integration、server module、実Next.js application lifecycleを分離して検証します。

細かな表示状態と操作をE2Eへ集めず、W1からW5へ下げます。実Next.js server、RSC、middleware、cookie、browser historyが必要なものだけをW6へ残します。

## コード構造との対応

推奨構造:

```text
apps/web/
  app/
  components/
    <component>/
      <component>.tsx
      <component>.test.tsx
      <component>.stories.tsx
  features/
    <feature>/
      index.ts
      server.ts
      model.ts
      schema.ts
      api.ts
      queries.ts
      hooks/
        use-<feature>-controller.ts
      test-support/
        fixtures.ts
      components/
        <screen>/
          client.tsx
          server.tsx
          view.tsx
          view.test.tsx
          view.stories.tsx
        <component>/
          <component>.tsx
          <component>.test.tsx
          <component>.stories.tsx
      <feature>.browser.test.tsx
  lib/
    client/
    server/
    shared/
  test/
  e2e/
```

依存方向:

```text
app
  → feature browser-safe index.tsまたはserver-only server.ts
  → app-wide components
  → lib/server

feature client composition
  → controller hook
  → View
  → client adapter

controller
  → model
  → ports

View
  → packages/ui
  → serialisable View type

model
  → framework非依存
```

禁止:

- DB、Email、Agent Workerへの直接依存
- API packageのserver内部またはschemaへのdeep import
- 別featureのprivate file import
- `*.public.ts`によるsymbol単位の公開
- featureからapp routeをimport
- Client Componentからserver-only moduleをimport
- feature rootへ本番`.tsx`を置く
- Web modelからReact、Next.js、Query、notificationをimport

`index.ts`はbrowser-safeな公開面、`server.ts`は先頭で`server-only`をimportするserver専用公開面です。別featureからはこの二入口だけを使います。component-localな表示用hookだけはcomponent directory内へ置けます。

## テスト層

| 名前                                       | Testing Trophy 分類 | テスト内容                                                                                                                                                                                                                                                                                                                                                                                                                        | 実物として使うもの                                                                               | 差し替えるもの                                               | 対象コード/ファイル                                                                                          | Test Runner                                     | 実行速度   | CI時間課金以外の費用 | 量         |
| ------------------------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | ---------- | -------------------- | ---------- |
| **Webロジック単体テスト (W1)**             | 単体                | <ul><li>reducer、state machine、view model、query keyを入力と期待結果で確認する</li><li>form schema、URL、search parameter、error responseの変換を境界値ごとに確認する</li><li>dirty guard、submission identity、upload中の遷移判断を確認する</li><li>Reactをrenderせず、framework非依存の規則を網羅する</li></ul>                                                                                                                | pure function、Valibot schema、serialisable model                                                | clock、ID、randomだけを固定する                              | `apps/web/features/**/model.ts`、`model/**`、`schema.ts`、`lib/shared/**`、pure formatter、query-key factory | Vitest Node                                     | 極めて速い | なし                 | 非常に多い |
| **Web DOMコンポーネント統合テスト (W2)**   | 統合                | <ul><li>propsまたはView modelから利用者に見えるDOMが描画されることを確認する</li><li>入力、submit、callback、controlled state、field errorを確認する</li><li>`aria-invalid`、`aria-describedby`、accessible role/nameを確認する</li><li>controllerとfake portを接続し、通知や重複処理のownerを確認する</li><li>layout measurementやnative focus trapはここで断定しない</li></ul>                                                  | React component、Testing Library、happy-dom、component hook                                      | API port、navigation、notification、clock、browser-only API  | `apps/web/components/**/*.test.tsx`、`features/**/components/**/*.test.tsx`、controller hook test            | Vitest + Testing Library + happy-dom            | 速い       | なし                 | 厚くする   |
| **Web Storybookブラウザー統合テスト (W3)** | 統合                | <ul><li>componentのloading、empty、error、ready、pending、disabled、destructive状態を実browserで描画する</li><li>keyboard、focus order、focus return、dialog、popover、menu、pointer eventを確認する</li><li>`play`で代表操作と利用者から観測できる結果を確認する</li><li>a11y addonでrendered DOMの自動検査を行う</li><li>Controlsでpublic propsを変更し、手動探索できる状態カタログを維持する</li></ul>                         | Storybook、実Chromium、React、CSS、component、decorator、a11y addon                              | props、callback、必要なprovider。HTTPが不要ならMSWを使わない | `apps/web/**/*.stories.tsx`、`apps/web/.storybook/**`、story fixture                                         | Storybook Vitest addon + Chromium               | 中         | なし                 | 多い       |
| **Web機能ブラウザー統合テスト (W4)**       | 統合                | <ul><li>実QueryClient、controller、複数componentを接続してfeature全体の状態を確認する</li><li>mutation後のcache更新、optimistic/pending、rollbackを確認する</li><li>MSWでsuccess、empty、400、404、409、500、network error、retryを再現する</li><li>Agent fake transportでstream、approval、abort、disconnect、resumeを確認する</li><li>SuspenseとError Boundaryのfallback、reset、retryを確認する</li></ul>                      | 実browser、React、QueryClient、controller hook、AI SDK UI、複数component                         | HTTPはMSW、Agent transport、navigation、notification、clock  | `apps/web/features/*/*.browser.test.tsx`、connected feature story、feature `test-support/fixtures.ts`        | Vitest Browser ModeまたはStorybook Vitest addon | 中から遅い | なし                 | 必要な範囲 |
| **Webサーバー統合テスト (W5)**             | 統合                | <ul><li>server-side Eden adapterがcookie、header、status、typed errorを正しく変換することを確認する</li><li>session response、slugからinternal ID、not-found、redirect、prefetch inputを確認する</li><li>serialisation、cache policy、server-only境界を確認する</li><li>純粋な判断を抽出した場合もW5のfixtureと責務の中で検査する</li><li>async RSCそのものを無理にVitestでrenderしない</li></ul>                                 | server loader、Eden client contract、Request/Response、server adapter、必要に応じElysia test app | remote API、real OAuth、production cookie、external provider | `apps/web/lib/server/**`、`features/*/server.ts`から到達するloader、server adapter、session parser           | Vitest Node、必要に応じephemeral Elysia app     | 中から遅い | なし                 | 必要な範囲 |
| **Webアプリケーション統合テスト (W6)**     | 統合                | <ul><li>実Next.js serverと実browserでApp Router、layout、page、RSC shellを確認する</li><li>middleware、cookie、hard reload、browser history、actual URLを確認する</li><li>intercepting route、parallel route、modalからfull pageへの遷移を確認する</li><li>`loading.tsx`、`error.tsx`、`not-found.tsx`がroute lifecycleで機能することを確認する</li><li>API、Agent、DB、Authは決定的に差し替え、Webの責務だけを検査する</li></ul> | 実Next.js application server、実Chromium、実RSC、routing、middleware、cookie jar                 | API、Agent stream、external service、DB、Auth backend        | `apps/web/app/**`、`middleware.ts`、top-level providers、`apps/web/test/app/**`または`e2e/web-app/**`        | Playwright                                      | 遅い       | なし                 | 少数       |

## W1: Webロジック単体テスト

W1はDOMとframework globalを使いません。React、Next.js、TanStack Query、browser APIをimportしないよう、lint境界を設定します。

特に次はW1へ下げます。

- table sort/filter state
- issue update state
- upload queue transition
- route change guard
- form draft merge
- error codeから表示modelへの変換
- date、URL、label suggestion

## W2: Web DOMコンポーネント統合テスト

Testing Libraryは、単一component fileをrenderしていても、React、DOM、event、child componentを接続するためTesting Trophy上は統合です。

assertionはimplementation detailではなく次を使います。

- role
- accessible name
- label
- visible text
- disabled state
- focusable state
- callbackに渡されたpublic value

内部state名、private class、component instance、CSS selectorだけに固定しません。

## W3: Web Storybookブラウザー統合テスト

W3は一つの表示単位を実ブラウザーで検査します。通信やfeature cacheを必要としない状態は、propsまたはView modelで与えます。

標準状態:

- loading
- empty
- error
- ready
- pending
- disabled
- destructive
- approval required
- tool running
- upload failed
- mobile representative
- dark-theme sensitive
- long content、overflow

lightでは全interactionとa11y、darkではtheme-sensitive storyだけを実行します。

## W4: Web機能ブラウザー統合テスト

`.browser.test.tsx`を各componentへ機械的に作りません。Storybookだけでは表現しにくいfeature integrationへ限定します。

```text
features/agent/
  agent-chat.browser.test.tsx
```

W4でもNext.js dev serverは起動しません。route lifecycleが必要ならW6です。

### MSWとEden型

MSW response bodyはEden由来の成功型、status別error型を使います。fixtureを型安全にしてもURL、method、path parameterの正しさは自動では保証されないため、API A4/A5を契約の正本とします。

### Agent UI

Agent UIのHTTPまたはstream transportを検査する場合を除き、MSWよりfake Agent transportを優先します。

必須scenario:

- idle
- initial loading
- text stream
- tool start/result
- approval required
- approval accept/reject
- abort
- disconnect
- resume
- malformed part
- usage projection
- reload projection

## W5: Webサーバー統合テスト

redirect decisionのような純粋処理も、Eden adapterのような統合処理も、Web server boundaryという同じ所有権、fixture、変更理由を持つため、W5を公開上さらに分割しません。

ただしtest内部では、失敗原因を明確にするため小さい関数を直接検査できます。

W5へ置くもの:

- server-side API client
- auth session response parser
- redirect、not-found decision
- slug解決
- prefetch input
- cache key、cache policy
- serialisation boundary

W6へ残すもの:

- async RSC composition
- middleware
- route interception
- cookie lifecycle
- hard reload
- browser history

## W6: Webアプリケーション統合テスト

W6はPlaywrightを使いますが、Web内で閉じるためE2Eではありません。

W6でdownstreamを差し替える理由:

- Webの失敗とAPI、Agent、DBの失敗を分離する
- route状態とbrowser historyを高速かつ決定的に再現する
- permissionやDB atomicityをmockで証明したと誤認しない
- E1のcritical journeyを増やさない

W6からW3/W4へ下げられるものは下げます。W6はroute、RSC、middleware、cookieへ限定します。

## Storybookの粒度

詳細は[Storybookとブラウザーコンポーネントテスト仕様](../common/storybook.md)を参照します。

Web固有の判断:

| 対象                                          | 分類       |
| --------------------------------------------- | ---------- |
| argsだけで描画するfeature View                | W3         |
| QueryClient、MSW、controllerを接続するfeature | W4         |
| routeから切り出したPage View                  | W3またはW4 |
| `page.tsx`、`layout.tsx`、middleware          | W5またはW6 |
| WebからDBまでの全構成                         | E1またはE2 |

## `packages/ui`との責務分担

- UI primitiveとdomain非依存patternのcontractは`packages/ui`
- feature固有View、Query、Agent UIはWeb
- WebはUI packageの内部fileをdeep importしない
- UI packageのtestでfeature domainを再現しない
- Web側ではUI primitive自体を全面再検査せず、feature内で正しくcompositionされることを確認する

## 実行

```json
{
  "scripts": {
    "test": "vitest run --project=unit",
    "test:browser": "vitest run --project=storybook-light --project=storybook-dark && vitest run --project=browser && bun run build:test:browser:app && bun run test:browser:app:chromium && bun run test:browser:app:webkit"
  }
}
```

project名は導入順に合わせます。存在しないprojectを先にscriptへ指定しません。

## 受入条件

- Web modelがframework非依存である
- W2がcomponent testの中心である
- focus、keyboard、a11yを実browserで検査する
- MSWをAPI契約の唯一の証明にしない
- `.browser.test.tsx`がfeature integrationに限定される
- W5を内部処理種別で公開分割しない
- Web内で閉じる実Next.js browser testをW6が所有する
- W6がAPI、Agent、DB、Authをmockし、Web責務だけを検査する
- async RSC、middleware、cookie、browser historyだけがW6へ残る
