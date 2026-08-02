---
title: Webテスト戦略
status: accepted
implementation: active
last_reviewed: 2026-08-02
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
  src/
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

| 名前                                       | Testing Trophy 分類 | テスト内容                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 実物として使うもの                                                                               | 差し替えるもの                                               | 対象コード/ファイル                                                                                                  | Test Runner                                     | 実行速度   | CI時間課金以外の費用 | 量         |
| ------------------------------------------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------- | -------------------- | ---------- |
| **Webロジック単体テスト (W1)**             | 単体                | <ul><li>reducer、state machine、view model、query keyを入力と期待結果で確認する</li><li>form schema、URL、search parameter、error responseの変換を境界値ごとに確認する</li><li>dirty guard、submission identity、upload中の遷移判断を確認する</li><li>Reactをrenderせず、framework非依存の規則を網羅する</li></ul>                                                                                                                                                     | pure function、Valibot schema、serialisable model                                                | clock、ID、randomだけを固定する                              | `apps/web/src/features/**/model.ts`、`model/**`、`schema.ts`、`src/lib/shared/**`、pure formatter、query-key factory | Vitest Node                                     | 極めて速い | なし                 | 非常に多い |
| **Web DOMコンポーネント統合テスト (W2)**   | 統合                | <ul><li>propsまたはView modelから利用者に見えるDOMが描画されることを確認する</li><li>入力、submit、callback、controlled state、field errorを確認する</li><li>`aria-invalid`、`aria-describedby`、accessible role/nameを確認する</li><li>controllerとfake portを接続し、通知や重複処理のownerを確認する</li><li>layout measurementやnative focus trapはここで断定しない</li></ul>                                                                                       | React component、Testing Library、happy-dom、component hook                                      | API port、navigation、notification、clock、browser-only API  | `apps/web/src/components/**/*.test.tsx`、`src/features/**/components/**/*.test.tsx`、controller hook test            | Vitest + Testing Library + happy-dom            | 速い       | なし                 | 厚くする   |
| **Web Storybookブラウザー統合テスト (W3)** | 統合                | <ul><li>componentのloading、empty、error、ready、pending、disabled、destructive状態を実browserで描画する</li><li>keyboard、focus order、focus return、dialog、popover、menu、pointer eventを確認する</li><li>`play`で代表操作と利用者から観測できる結果を確認する</li><li>a11y addonでrendered DOMの自動検査を行う</li><li>Controlsでpublic propsを変更し、手動探索できる状態カタログを維持する</li></ul>                                                              | Storybook、実Chromium、React、CSS、component、decorator、a11y addon                              | props、callback、必要なprovider。HTTPが不要ならMSWを使わない | `apps/web/src/**/*.stories.tsx`、`apps/web/.storybook/**`、story fixture                                             | Storybook Vitest addon + Chromium               | 中         | なし                 | 多い       |
| **Web機能ブラウザー統合テスト (W4)**       | 統合                | <ul><li>実QueryClient、controller、複数componentを接続してfeature全体の状態を確認する</li><li>mutation後のcache更新、optimistic/pending、rollbackを確認する</li><li>MSWでsuccess、empty、400、404、409、500、network error、retryを再現する</li><li>Agent fake transportでstream、approval、abort、disconnect、resumeを確認する</li><li>SuspenseとError Boundaryのfallback、reset、retryを確認する</li></ul>                                                           | 実browser、React、QueryClient、controller hook、AI SDK UI、複数component                         | HTTPはMSW、Agent transport、navigation、notification、clock  | `apps/web/src/features/*/*.browser.test.tsx`、connected feature story、feature `test-support/fixtures.ts`            | Vitest Browser ModeまたはStorybook Vitest addon | 中から遅い | なし                 | 必要な範囲 |
| **Webサーバー統合テスト (W5)**             | 統合                | <ul><li>server-side Eden adapterがcookie、header、status、typed errorを正しく変換することを確認する</li><li>session response、slugからinternal ID、not-found、redirect、prefetch inputを確認する</li><li>serialisation、cache policy、server-only境界を確認する</li><li>純粋な判断を抽出した場合もW5のfixtureと責務の中で検査する</li><li>async RSCそのものを無理にVitestでrenderしない</li></ul>                                                                      | server loader、Eden client contract、Request/Response、server adapter、必要に応じElysia test app | remote API、real OAuth、production cookie、external provider | `apps/web/src/lib/server/**`、`src/features/*/server.ts`から到達するloader、server adapter、session parser           | Vitest Node、必要に応じephemeral Elysia app     | 中から遅い | なし                 | 必要な範囲 |
| **Webアプリケーション統合テスト (W6)**     | 統合                | <ul><li>実Next.js serverと実browserでApp Router、layout、page、RSC shellを確認する</li><li>middleware、cookie、hard reload、browser history、actual URLを確認する</li><li>一覧から正規詳細ルートへの全画面遷移と戻る操作で、一覧URLとdocumentのスクロール位置が復元されることを確認する</li><li>`loading.tsx`、`error.tsx`、`not-found.tsx`がroute lifecycleで機能することを確認する</li><li>API、Agent、DB、Authは決定的に差し替え、Webの責務だけを検査する</li></ul> | 実Next.js application server、実Chromium、実RSC、routing、middleware、cookie jar                 | API、Agent stream、external service、DB、Auth backend        | `apps/web/src/app/**`、`middleware.ts`、top-level providers、`apps/web/test/app/**`または`e2e/web-app/**`            | Playwright                                      | 遅い       | なし                 | 少数       |

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

DataTableでは、選択行のsemantic state、結果と同じgrid領域でtable終端に拘束されるsticky selection bar、
非sticky footerの左右領域、query更新中も直前行が残ること、
Comboboxの矢印・決定・Escape、Priority rangeのsingletonとinclusive境界、ToggleGroupの単一必須選択、
toolbarの単独controlとgroup構成、検索clearのdebounce取消・即時1回更新・focus return、filter/sort Resetの
独立scopeとdisabled state、active filter summaryのaccessible description、sortのlabel・icon mapping、
`Match any` / `Match all`、期日の1か月range Calendarによる部分範囲・完成範囲・選択解除、
Actions header内の列表示Eye/EyeClosedをこの層で固定します。

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

lightでは全interactionとa11y、darkではtheme-sensitive storyだけを実行します。Storybook projectは
`fileParallelism: false`と`maxWorkers: 1`で各テーマ内のfileを直列化します。ローカルの
`test:browser:components`はlight、dark、通常のBrowser Modeを順に実行し、CIは3つを独立jobとして
並列実行します。unitとStorybook以外のbrowser projectの並列度は変更しません。

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
- 一覧から詳細へのルート遷移
- cookie lifecycle
- hard reload
- browser history

## W6: Webアプリケーション統合テスト

W6はPlaywrightを使いますが、Web内で閉じるためE2Eではありません。
CI、Playwright project、artifact、利用者向けログでは責務が分かる`Next.js integration`という名称を
使い、W6は文書上のテスト分類名としてだけ使います。

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
    "test:browser": "vitest run --project=storybook-light && vitest run --project=storybook-dark && vitest run --project=browser && bun run build:test:browser:app && bun run test:browser:app:chromium && bun run test:browser:app:webkit"
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

## DataTableの検査層

- W1: prefixあり・なしのURL key、複数値URLの正規化、廃止済み単一値キーの非移行と削除、request/query key一致、
  assignee 50件・label 20件の上限、期日2境界のoffset、selection prune、pagination window、
  versioned localStorageの復元を純粋testで固定する
- W2: `Table<TData>` rendererへlink、button、select、menuなど任意のinteractive cellを渡し、row selectionと
  eventが交差しないこと、pinned optionの検索・描画、利用者別列表示のwrite/restore/resetをcomponent testで
  固定する
- W3: `Default`、`InteractiveCells`、`Selectable`、`HorizontalOverflow`、`Mobile`のnamed storyで
  keyboard、focus、indeterminate、table内だけの横scrollを検査する
- IssuesのW3では`SearchClearAndKeyboard`、`ActiveFilterSummaries`、`PinnedHeaderAndSelectionBar`と
  mobile storyで検索clear、6px dot、avatar/label/date summary、48px headerと32px row action、列pin、
  selection anchor自身のsticky bottom・viewport下端・table拘束・safe area、document横overflowなしを固定する。
  active summaryは各triggerのaccessible descriptionとして全選択値を通知し、期日は固定clockで
  current year内の省略形と非current/cross-yearの年表示を固定する。
  toolbar controlの寸法、sortのfocus return、検索可能filterのinsetと全幅mode、期日popoverの
  viewport margin・短い画面での内部scrollも同じW3で検査する
- Organizations、Members、Invitations、Sessionsは同じrendererを使うことをW2で確認し、既存のsort、
  search、Select、Menu、mutation actionを回帰させない。各W3のmobile storyは全列を維持したtable内横scrollと
  document全体の横overflowなしを確認する
- Members画面はW1で主表のprefixなしkeyとInvitationsの`inv_*` keyを固定し、同一nuqs adapter上で一方の
  filter、page、page size更新が他方の検索・filter・paginationを維持することを確認する。W3では両表の
  検索clear、filter、sort、group別reset、page size、ページ移動を操作し、既存のmember/invitation actionと
  同居できることを確認する
- W4: Issuesの実QueryClient、nuqs、MSW接続で複合filterのclose時一括反映、selection、pagination、
  column visibility、remote label更新中のdraft維持を検査する。絞り込みの編集中はGETを送らず、閉じた時に
  1回だけ送ること、遅い旧label検索が新しい結果を上書きしないこと、query key変更中は直前行とspinnerを
  維持しながらmutation操作を無効化することを同じ接続で確認する

URL searchのdebounceは固定sleepでなくobservableなcallbackを待ち、clearはfake timerとnuqs adapterで
timer後の二重更新がないことと`q`/page以外の維持を検査します。popoverやmenuのportalは
`canvasElement.ownerDocument.body`から検査します。期日filterはDST遷移と、現在が夏で選択範囲が冬のcaseを
固定し、Calendar操作から生成したAPI requestの2つのoffsetを検査します。外部URL由来の部分範囲の完成、
同日・複数日の完成範囲、選択解除、close時の1回だけの適用とfocus return、外部URLの逆転範囲をrequestへ
送らず空範囲へ戻すことも固定します。
