---
title: apps/webの設計
status: accepted
implementation: active
last_reviewed: 2026-08-20
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
- [SuspenseとError Boundary](#suspenseとerror-boundary)
- [portとadapter](#portとadapter)
- [componentとstory](#componentとstory)
- [import境界](#import-boundary)
- [テスト配置](#テスト配置)
- [理由と代償](#理由と代償)
- [受入条件](#受入条件)

## 責務

`apps/web`はNext.js routing、React Server Component、domain-specific UI、browser state、Eden
client、Agent stream UIを所有します。DB、Email、Agent model runtimeは所有しません。

## 目標構造

```text
apps/web/
  src/
    app/
      (public)/
      (console)/
      api/
      layout.tsx

    components/
      providers/
        providers.tsx
      console-shell/
        console-shell.tsx
      route-error/
        route-error.tsx

    features/
      <feature>/
        index.ts
        model.ts
        schema.ts
        api.ts
        queries.ts

        hooks/
          use-<feature>-controller.ts

        components/
          <component-name>/
            <component-name>.tsx
            <component-name>.test.tsx
            <component-name>.stories.tsx

          <screen-name>/
            server.tsx
            client.tsx
            view.tsx
            suspense.tsx
            skeleton.tsx
            error-boundary.client.tsx
            error-view.tsx
            async-states.stories.tsx
            async-states.browser.test.tsx

        test-support/
          fixtures.ts

    lib/
      client/
      report-observed-error.ts
      server/
      shared/

    instrumentation.ts
    instrumentation-client.ts

  e2e/
  test/
```

上のfileは全て必須ではありません。`model.ts`、`schema.ts`、`api.ts`、`queries.ts`、`hooks/`、
非同期画面用のfileは、その責務が存在するときだけ作ります。React componentはServer Component、
Client Component、Skeleton、error表示を含め、必ず`components/`配下へ置きます。feature directory
直下へ`.tsx`を置きません。

単純なcomponentも`components/<component-name>/<component-name>.tsx`へ置きます。同じ画面に関連する
componentは`components/<screen-name>/`へまとめます。全featureへ同じ空directoryや雛形fileを
生成しません。

型またはre-exportだけを置く補助fileは、利用箇所に近いfeature rootまたは`components/`直下へ置き、
専用の1-file directoryを作りません。component本体、test、story、非公開subcomponentをまとめる
directoryは、表示と検証の意味ある配置境界として維持します。

## app directory

`src/app/`はNext.js routeとfeatureの公開componentを組み合わせる場所です。

許可:

- route param
- Server Componentでのdata loading
- session check
- metadata
- redirect、not found
- feature public entrypointから公開されたcomponentの組立て

禁止:

- domain rule
- reusable mutation implementation
- feature private componentのdeep import
- 大規模なClient Component

route fileを薄く保つと、Next.js file conventionとproduct logicを分離できます。

Organization内のIssue詳細は
`/organization/[organizationSlug]/issues/[issueNumber]`を正規ルートとし、一覧のIssue名と
「View details」はこの全画面ページへ遷移します。Issue詳細ではNext.jsのParallel Routesと
Intercepting Routesを使わず、クライアント遷移、直アクセス、再読み込みで同じページ構成を表示します。
Consoleの縦スクロールは共有レイアウト内の独自コンテナではなくdocumentが所有します。これにより、
一覧から詳細へ進んでbrowser historyで戻る場合は、App Routerが一覧URLとdocumentのスクロール位置を
標準の履歴として復元します。共有レイアウトでルート変更を監視して`scrollTo`を実行したり、
`sessionStorage`へルート別スクロール位置を複製したりしません。

## feature

feature rootの責務:

| file                             | 責務                                                     |
| -------------------------------- | -------------------------------------------------------- |
| `model.ts`                       | pure state、view model、reducer                          |
| `schema.ts`                      | Web-local runtime validation                             |
| `api.ts`                         | Eden client adapter                                      |
| `queries.ts`                     | TanStack Query options                                   |
| `hooks/use-*-controller.ts`      | browserで動くAPI呼出、router、toast等と表示用stateの接続 |
| `components/<screen>/server.tsx` | Server Componentでの初期data取得と画面の組立て           |
| `index.ts`                       | browser-safeなfeature公開surface                         |
| `server.ts`                      | `server-only`なfeature公開surface                        |

Web-local schemaはAPI transport typeの代用品ではありません。untrusted responseをUIへ表示する
直前のruntime validationに使います。

`model.ts`、reducer、view-modelはReact、Next.js、TanStack Query、router、toast、API client、
`fetch`、`useChat`、browser APIをimportしません。別featureのUIから利用できるのは`index.ts`が
明示exportしたブラウザー用契約、サーバーの合成処理から利用できるのは`server.ts`が公開した
サーバー専用契約です。実行時検証だけが必要な`adapter`は、feature rootの`schema.ts`をデータだけの
公開entrypointとして利用できます。`src/lib/browser/**`と`src/lib/server/**`の合成処理は、
UIを含む`index.ts`を評価せずfeatureのクライアント`adapter`を生成するために、feature rootの`api.ts`を
直接importできます。公開する`schema.ts`と`api.ts`はコンポーネント、Query、router、toast、ブラウザー固有
またはサーバー固有のモジュールをimportせず、`components/`と`queries.ts`は公開面へ流しません。

### Browserのserver state

browserで取得するserver stateとmutationはTanStack Queryへ集約します。default retry、error mapping、
stale time等の共通policyは`QueryClient`生成時に確定し、component mount後のeffectで書き換えません。
componentごとの差分はquery optionsまたはmutation optionsへ明示し、global defaultの後付け変更による
mount順依存を作りません。

## serverとclient

React Server Componentは、browserへJavaScriptを送らずserverで実行されるcomponentです。この文書では
以後Server Componentと表記します。

- Server Componentは`src/features/<feature>/components/<screen>/server.tsx`へ置く
- その他のserver codeは`src/lib/server/**`、`*.server.ts`へ置く
- browserで動くcomponentは`src/components/**`または`src/features/**/components/**`の
  `*.client.tsx`、controllerは`src/hooks/**`またはfeature内の`hooks/**`へ置く
- browserから`next/headers`、server env、server-only moduleをimportしない
- Server Componentはinitial dataとauthorizationを担当し、interactive stateはClient Componentへ渡す

初期dataをServer Componentで取得できる画面では、全data fetchingをClient Componentへ集めません。

## controllerとview

単純なcomponentは一fileでよいです。次の条件を満たす場合だけ分割します。

```text
components/<screen>/client.tsx
hooks/use-<screen>-controller.ts
components/<screen>/view.tsx
```

分割条件:

- Query/mutation/router/toast/streamが複数ある
- function size budgetを超える
- Storybookでview stateを独立させたい
- side effectのraceやcancelをunit testしたい

`view`は`apiClient`、Query、mutation、router、toast、`fetch`、`useChat`、chat transportを
直接importせず、stateとactionをpropsで受けます。

`client.tsx`はcontroller hookを呼び、その戻り値を`view.tsx`へpropsとして渡す薄いClient Component
です。`view.tsx`はpropsからDOMを描画します。この分割が不要な小さいcomponentは一fileに保ちます。

複数のasync state、cancel、approval、stream resumeが絡むflowはbooleanを増やさず、
discriminated unionまたはreducer/state machineへ移します。これにより不可能なstateを型で消し、
raceと復元をpure testで再現できます。

## SuspenseとError Boundary

Client ComponentがSuspense対応Query、`use()`、`lazy`/dynamic import等によりrender中にdata待ちに
なり得る場合は、Reactの`<Suspense>`とReact Error Boundaryを用意します。Error Boundaryとは、
browserで子componentがrender中にthrowした予期しないerrorを捕捉し、安全なerror表示とretry/resetを
出すReact componentを指します。

async Server Componentのerrorはclient用React Error Boundaryでは捕捉できません。Next.js route
segmentの`loading.tsx`と`error.tsx`で扱い、後述のPlaywright W6で検証します。

一つの非同期画面は、必要に応じて次のfileを`components/<screen>/`へ置きます。

```text
server.tsx
client.tsx
view.tsx
suspense.tsx
skeleton.tsx
error-boundary.client.tsx
error-view.tsx
async-states.stories.tsx
async-states.browser.test.tsx
```

client側でdata待ちになる画面の`suspense.tsx`は、少なくとも次の順序で子componentを囲みます。

```tsx
<ScreenErrorBoundary>
  <Suspense fallback={<ScreenSkeleton />}>{children}</Suspense>
</ScreenErrorBoundary>
```

- `skeleton.tsx`はloading中に必要な幅、高さ、grid、scroll領域を予約する
- `error-boundary.client.tsx`はclient render errorを捕捉し、`error-view.tsx`を表示する
- `error-view.tsx`は固定の利用者向けmessage、見出しへのfocus、retry/resetを提供する
- client-side QueryがSuspenseを使わない場合も、初回loadingでは同じSkeletonを表示する
- validation errorやmutation失敗等、通常起こり得る失敗はError Boundaryへthrowせずview stateで表示する
- 予期しないclient render/data load失敗は`error-boundary.client.tsx`で扱う
- Server ComponentからClient Componentへはserializableなpropsだけを渡す

click後にだけ動くmutation、router、toast、focus変更等は、それだけを理由に`<Suspense>`で囲みません。
buttonをdisabledにする、pending textを出す、安全なerrorを表示する等、そのcomponentの通常stateとして
実装し、storyとBrowser Modeで検証します。

Ready、loading、errorは同じ外側のshell、grid column、header/body領域、content padding、
`min-height`、`scrollbar-gutter`を共有します。Skeletonは装飾ではなく、loading中のlayout spaceを
確保するcomponentです。`aria-busy`と安全なstatus labelを持ち、`aria-hidden`配下へbutton/linkを
残しません。Error表示は見出しへfocusし、`role="alert"`、安全なmessage、明示的なretry/resetを
提供します。

Error表示は`Error.message`、Next.jsの`digest`、stack、cause、現在URL/query、API/providerのraw応答、
email、tenant/resource IDをDOM、accessible name、`aria-live`へ出しません。表示するのは固定の
利用者向け文言と、公開可と検証済みのrequest IDだけです。raw errorはlocal OpenTelemetryへ送り、
認証materialはcollectorで除去し、UIのpropsへ展開しません。

async Server Componentを使うNext.js route segmentには`loading.tsx`と`error.tsx`を置きます。
`loading.tsx`はfeatureの`components/<screen>/skeleton.tsx`、`error.tsx`は
`components/<screen>/error-view.tsx`をimportする薄いfileにします。`error.tsx`はNext.jsの規則に従う
Client Componentであり、Next.jsがそのroute segmentのError Boundaryを作ります。`error.tsx`は
`reset` callbackだけをerror viewへ渡し、受け取ったraw `error` objectをpropsまたはDOMへ渡しません。
複数routeで同じSkeletonまたはerror viewを共有するのは、外側のshellと予約するlayout spaceが同じ
場合だけです。各routeのloading、error、retry、ready遷移はPlaywright W6で検証します。
route固有の証跡はstate surfaceの`data-route-boundary="true"`をassertし、共有
`data-console-shell`だけのloading/error遷移をそのrouteの証跡には数えません。geometry、focus、
overflowは代表routeのshared-boundary matrixで重ねて検証します。

client側のSuspense対応画面は対象componentのBrowser Mode test、async Server Component routeは
実routeを通るPlaywright W6で検証します。新しい画面やrouteのreviewでは、Skeleton、
Error Boundary、`loading.tsx`、`error.tsx`と対応testを同じ変更で確認します。

対応表、独自source graph、architecture checkerは追加しません。local/shared hookやre-exportへ
処理を移した場合も、利用する画面の実testを残します。

## portとadapter

Webでportを作るのは、複雑なfeatureがtest時に明確な差し替えを必要とする場合だけです。

例:

```ts
export type NotificationPort = {
  error(message: string): void
}
```

単純なAPI wrapperを全てinterface化しません。`api.ts`や`queries.ts`で十分な場合はportを作りません。
Sonner、router、Agent transportの具体実装はcontroller、またはcontroller hookを呼ぶClient Component
で注入し、
pure model/viewから暗黙のsingletonとして参照しません。

## componentとstory

基本形:

```text
feature-panel/
  feature-panel.tsx
  feature-panel.test.tsx
  feature-panel.stories.tsx
```

- `test.tsx`: happy-domでDOM contract
- `stories.tsx`: state catalogue、interaction、a11y、light/dark
- `browser.test.tsx`: real QueryClient、必要な範囲だけのtransport stub、chat transportなどfeature integrationだけ
- `visual.test.tsx`: 現在は作らない

Storybook projectがbrowserでimport可能なpublic componentと主要Viewにはnamed storyを必須にします。
対象はfirst-party `.tsx` moduleのdefault component export、uppercase named function/class、
`memo`/`forwardRef`/component HOC等へ解決されるexportで、`"use client"` graphからserver-only edge
なしに到達できるものです。module自身に`"use client"`がなくてもclient graphへ合法に入るpure
componentを含みます。

- `packages/ui/src/**`のbrowser component
- `apps/web/src/**/*.tsx`から後述の構造上の除外を引いたbrowser component/view
- provider、portal、error、skeletonもbrowser import可能なら対象

構造上の除外はasync Server Component、`server.tsx`/`*.server.tsx`/`server-only` graph、Next.jsの
`page/layout/template/loading/error/global-error/not-found/default` special file、test/story/fixture、
generated、non-component JSX factory、module非exportの局所helperだけです。React Email templateは
browser componentではなくEmail preview/render testが検証を担当します。special fileの表示本体がbrowser
import可能ならviewへ抽出し、そのviewにはstoryを作ります。dead/legacy componentはstory免除にせず
削除します。

public componentと主要Viewは少なくとも一つのnamed storyで実componentを描画します。
親からしか使わないprivate subcomponentは、publicな親story内で実物が描画・操作される場合に
個別storyを要求しません。`.stories.tsx`が存在するだけ、またはstory専用の代替componentだけを
描画する状態はreviewで拒否します。repo全体を走査するstory coverage checkerは置かず、
Storybookが収集したstoryの実render、interaction、a11yをBrowser Modeで検証します。

story fileはcomponentの近くに置きますが、file名の機械的な一対一対応は要求しません。
`issue-table.tsx`を扱う`issue-table.stories.tsx`のような配置でも、同じ画面のReady、Loading、
Errorをまとめた`components/issue-screen/async-states.stories.tsx`でも構いません。一つのstory fileで
複数componentを扱え、一つのcomponentを複数stateのstoryで描画できます。private subcomponentは
親storyの操作とassertionから到達できることを確認します。

browser専用環境なしではimportできない処理がある場合は、その処理をhookまたはportの後ろへ置き、
描画部分を通常のReact componentとしてStorybookからimportできるようにします。例外allowlistには
exact path、理由、責任者、削除条件が必要で、directory単位の除外は認めません。componentとstoryの
対応を人が別manifestへ重複記載しません。UI primitiveのstoryは`packages/ui`、domain/viewのstoryは
`apps/web`が管理し、新しいbrowser componentとstoryを同じ変更でreviewします。
UI Storybookから
apps/webをimportしません。

非同期画面のstoryは少なくともLoading、Error、Readyを持ち、意味のあるEmpty、Pending、
Permission、responsive stateもcanonical fixtureで追加します。story専用の簡略componentや
production hookのmockは作らず、network/transport/portだけをfakeにします。

`dialog`、`light`、`dark`などStorybookのargと識別子は英語へ統一します。

## import boundary

許可:

```text
@enterprise-agentic-saas/api/client
@enterprise-agentic-saas/auth/client
@enterprise-agentic-saas/ui/*
@/features/<feature>/schema データだけの実行時検証契約
@/features/<feature>/api src/lib/browserまたはsrc/lib/serverの合成処理だけ
```

禁止:

```text
@enterprise-agentic-saas/db/**
@enterprise-agentic-saas/email/**
@enterprise-agentic-saas/api/* ただし client を除く
@/features/<other-feature>/* 上記の公開entrypoint以外の非公開パス
@/app/**
```

同じfeature内部はrelative importを使い、別featureのUI契約は`@/features/<feature>`からimportします。
`schema.ts`と`api.ts`の例外を、コンポーネントや補助関数の非公開パスへ広げません。

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

// data-only cross feature contract: allowed
import { parseOrganization } from "@/features/organizations/schema"

// cross feature private path: forbidden
import { IssueLink } from "@/features/issues/components/issue-link"
```

## テスト配置

- pure model/schema/error mapping: `bun run test`
- component DOM/controller: `bun run test`
- story interaction/a11y: `bun run test:browser`
- feature browser integration: `bun run test:browser`
- loading/error/readyのlayout stability: `bun run test:browser`
- Server Component、routing、cookie、cross-origin: `bun run test:e2e`

## 理由と代償

### 理由

- Server ComponentとClient Componentの責務が明確になる
- side effectをviewから分離し、Storybookとunit testを使いやすくする
- loading/errorを付随的なroute fallbackではなく同じlayout contractのstateとして扱い、
  navigation時のlayout shift、focus loss、retry不能を防ぐ
- public componentと主要ViewをStorybook catalogueへ置き、未到達stateとa11y regressionを実装時に発見する
- cross-feature couplingをpublic entrypointへ限定する

### 代償

- controller/view分割にpropsが増える
- Story、Skeleton、Error Boundary componentの保守対象が増える
- Web-local schemaが追加される
- feature public surfaceの設計が必要になる

分割は条件付きにし、単純componentのceremonyを避けます。同じ外側のshellと予約領域を持つroute群は、
各routeの状態遷移testがある場合だけSkeleton/Error表示を共有できます。

## DataTable compositionとURL状態

domain非依存の表compositionは`apps/web/src/components/data-table`が所有します。rootは
`scrollLabel`と任意のtable childを受け、captionもchildとして渡します。headerとbodyはfeatureが構築した
TanStack Tableの`Table<TData>`を受け、bodyのchildはempty stateです。共通層は`ColumnDef`や
`useReactTable`を所有せず、headerとcellを`flexRender`で描画します。row全体のclick handlerや
interactive cellの複製は追加しません。列pinはTanStackのcolumn stateを正本にし、選択列は共通factoryと
feature固有の`getRowId`、controlled stateで現在の結果だけへ限定します。
Issuesを先行利用者とし、Organizations、Members、Invitations、Sessionsも同じroot、header、bodyへ
移行します。各featureはsort、filter、列定義、空状態、mutation用Contextを引き続き所有します。列幅と
配置はcolumn metaへ置き、table全体の最小幅と外枠の角丸はrootの任意classとして渡します。共通rendererは
列IDやdomain固有のcellを判定しません。

表のURL keyはgeneric factoryから作り、logical keyを変えず、prefixなしを既定とします。同じ画面に複数の
表を置く場合だけcallerが`org_q`のようなprefixを指定します。Issuesは共有済みURLとの互換のため
`statuses`、`assignees`、`labels`を単数URL keyへ明示的にaliasします。優先度は`priorityFrom`と
`priorityTo`だけ、期日は`dueFromOffset`と`dueToOffset`だけを読みます。廃止済みの単一値キーは移行せず、
次の正規URL更新で削除します。表が所有しない`agentThread`はprefix対象にせず維持します。
assigneeは50件、labelは20件を上限とし、重複除去と決定的sortの後に切り詰めてAPI modelと一致させます。
文字検索はreplace history、filter、sort、page、
page sizeの離散操作はpush historyを使います。

Members画面ではMembers tableを主表としてprefixなしの`q`、`roles`、`methods`、`sort`、`dir`、`page`、
`pageSize`を使い、同居するInvitations tableは`inv_q`、`inv_roles`、`inv_statuses`、`inv_sort`、
`inv_dir`、`inv_page`、`inv_pageSize`へ分離します。
両表は取得済みの組織データをclient-sideで検索、絞り込み、sortし、一方の操作で他方のURL状態を消去しません。
検索欄は入力中のdraftを即座に表へ反映してURLだけをdebounceし、clearは保留中の更新を破棄して即時反映します。
独自の件数表示は持たず、共通footerが20、50、100件のpage sizeとページ移動を所有します。

列表示は利用者ID、table ID、versionを含むlocalStorage keyへ保存します。保存値は既知でhide可能な列だけを
復元し、select、主要title、actions列は非表示にできません。

検索可能な選択肢はlabelと追加keywordを検索対象にし、呼び出し元が指定した固定選択肢だけを常に先頭へ
残します。Issuesのassigneeでは現在利用者だけを`You`としてAvatarと名前の隣へ描画し、label filterには
固定領域を作りません。検索可能な複数選択は共通Comboboxのキーボード操作とフォーカス契約を使い、検索欄、
選択肢一覧、区切り、下端の一致方法を同じ余白で区切ります。検索不要なStatusの複数選択はBase UI Selectの
標準typeaheadと選択後も開いたままの操作を使います。Priorityの単一値shortcutとlabelの
`Match any` / `Match all`はBase UI ToggleGroupの単一必須選択とroving focusを使い、選択肢内には
装飾iconを置きません。

Issues toolbarでは検索を単独controlとし、FiltersとSortをoutline groupにまとめます。検索のclearはpending
debounceを破棄して`q`の消去を1回だけ即時反映し、入力へfocusを戻します。FiltersのResetはfilter draftだけ、
SortのResetは`updatedAt`降順だけをpage 1へ反映し、`q`、page size、`agentThread`と相互の状態を維持します。
列表示menuは48px幅のpinned Actions headerへ置き、行の32px action buttonと列幅を変えません。sortは
内部IDを表示せず、fieldとdirectionのtrigger・optionで明示labelと代表iconを組にします。active filterは
共通countの代わりにfeature所有のstatus/priority dot、assignee avatar、label/mode、実日付範囲を要約し、
triggerのaccessible descriptionから同じ値を通知します。期日の表示はcurrent year内だけ年を省略し、
非current yearまたは年をまたぐ範囲では各境界へ年を表示します。
期日popoverは1か月のrange Calendarだけを表示し、presetやdate inputを持ちません。最初の日の選択は
同日を両境界とする範囲になり、別の日を選ぶとその日までの範囲を完成させます。外部URLの`dueFrom`だけの
部分範囲もCalendarへ復元して続きの日を選択できます。Calendarの選択を解除した場合は両境界とoffsetを
消去します。popoverはviewport margin内の最大幅・高さと内部scrollを持ち、close時にdraftを1回だけ適用して
triggerへfocusを戻します。
APIへは`dueFrom`当日開始と`dueTo`翌日開始の各local boundaryで別々に計算したoffsetを送り、DSTをまたぐ範囲や
現在と異なる季節を選んでも表示日界とUTC instantを一致させます。Calendarは日付順の範囲を返し、外部URLの逆転範囲は
offsetと日付の対応を復元できないため、日付・offsetを消去して空範囲へ戻します。

query key変更中はTanStack Queryの`keepPreviousData`で直前の行と件数を維持し、table region右上の
accessible spinnerで更新中を示します。選択行はsemantic primary色を使い、pin列のcell背景を不透明に
しません。選択summaryとclearはcontentとfooterを囲むresults scope内で、結果と同じgrid領域のsticky anchorへ
置きます。anchor自身の高さを維持して配置をずらさず、viewport下端のsafe areaより上へ追従し、
scope終端で解放します。footer自体はstickyにせず、matching件数を
左、page sizeとpaginationを右へ置きます。
直前行が`isPlaceholderData`である間は、選択とstatus、priority、assignee、期日、行menu、削除を無効化し、
同じquery keyの通常再取得では操作可能な状態を維持します。
`useSearchParams`と`useQueryStates`はclient専用moduleへ閉じ、server-safe parser・serializerのbarrelから
再exportしません。

## 受入条件

- `src/app/`に大規模なClient Componentがない
- viewからQuery/router/toast/API importがない
- browser codeからserver module importがない
- cross-feature deep importがない
- 新規または変更したpublic componentと主要Viewに実componentを描画するnamed storyがある
- feature directory直下にReact componentの`.tsx`がない
- client render中に待機し得るcomponentに`<Suspense>`、Skeleton、React Error Boundary、
  Browser Mode testがある
- async Server Componentのrouteに`loading.tsx`、`error.tsx`、Playwright W6がある
- Error Boundaryがraw error、URL/query、private identifierをDOMまたは読み上げ領域へ出さない
- ready/loading/error transitionでlayout shiftとhorizontal overflowがない
