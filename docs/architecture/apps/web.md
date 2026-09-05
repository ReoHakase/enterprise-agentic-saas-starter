---
title: apps/webの設計
status: accepted
implementation: active
last_reviewed: 2026-09-05
applies_to:
  - apps/web/**
---

# apps/webの設計

## 目次

- [責務](#責務)
- [目標構造](#目標構造)
- [routes directory](#routes-directory)
- [feature](#feature)
- [serverとbrowser](#serverとbrowser)
- [controllerとview](#controllerとview)
- [SuspenseとError Boundary](#suspenseとerror-boundary)
- [portとadapter](#portとadapter)
- [componentとstory](#componentとstory)
- [import境界](#import-boundary)
- [テスト配置](#テスト配置)
- [理由と代償](#理由と代償)
- [受入条件](#受入条件)

## 責務

`apps/web`はTanStack Start、TanStack Routerによるルーティング、React UI、ブラウザー状態、
TanStack Startのサーバー関数、Edenクライアント、AgentストリームUIを所有します。DB、Email、
Agentモデルのランタイムは所有しません。

## 目標構造

```text
apps/web/
  vite.config.ts
  wrangler.jsonc
  src/
    start.ts
    server.ts
    router.tsx
    routeTree.gen.ts
    routes/
      __root.tsx
      (public)/
      _console/

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
      browser/
      report-observed-error.ts
      server/
      shared/

    instrumentation-client.ts

  e2e/
```

上のfileは全て必須ではありません。`model.ts`、`schema.ts`、`api.ts`、`queries.ts`、`hooks/`、
非同期画面用のfileは、その責務が存在するときだけ作ります。再利用するReactコンポーネント、
Skeleton、エラー表示は`components/`配下へ置きます。機能ディレクトリ直下へ`.tsx`を置きません。
`routeTree.gen.ts`はTanStack RouterのViteプラグインが生成する実行時ソースであり、手編集しません。

単純なcomponentも`components/<component-name>/<component-name>.tsx`へ置きます。同じ画面に関連する
componentは`components/<screen-name>/`へまとめます。全featureへ同じ空directoryや雛形fileを
生成しません。

型またはre-exportだけを置く補助fileは、利用箇所に近いfeature rootまたは`components/`直下へ置き、
専用の1-file directoryを作りません。component本体、test、story、非公開subcomponentをまとめる
directoryは、表示と検証の意味ある配置境界として維持します。

## routes directory

`src/routes/`はTanStack Routerのファイルルートと機能の公開コンポーネントを組み合わせる場所です。

許可:

- ルートパラメーターと検索パラメーター
- `loader`によるデータ取得と認証確認
- `head`と`headers`によるメタデータ、CSP、キャッシュ方針
- `redirect`、`notFound`
- `pendingComponent`、`errorComponent`、`notFoundComponent`
- 機能の公開入口から公開されたコンポーネントの組み立て

禁止:

- domain rule
- reusable mutation implementation
- feature private componentのdeep import
- 再利用される大規模な画面コンポーネント

ルートファイルを薄く保つと、TanStack Routerのファイル規約と製品ロジックを分離できます。
サーバーでだけ実行する取得処理は`createServerFn`で定義し、`loader`は入力の組み立て、
`QueryClient.ensureQueryData`、リダイレクトまたは404の判断に限定します。ルーターごとに新しい
`QueryClient`を作り、セッション、Cookie、テナントの取得結果をモジュール全体で共有しません。

Organization内のIssue詳細は
`/organization/:organizationSlug/issues/:issueNumber`を正規ルートとし、一覧のIssue名と
「View details」はこの全画面ページへ遷移します。Issue詳細では別のモーダル用ルートを作らず、
クライアント遷移、直アクセス、再読み込みで同じページ構成を表示します。
Consoleの縦スクロールは共有レイアウト内の独自コンテナではなくdocumentが所有します。これにより、
一覧から詳細へ進んでブラウザー履歴で戻る場合は、TanStack Routerの`scrollRestoration`が一覧URLと
documentのスクロール位置を標準の履歴として復元します。共有レイアウトでルート変更を監視して
`scrollTo`を実行したり、
`sessionStorage`へルート別スクロール位置を複製したりしません。

## feature

feature rootの責務:

| file                        | 責務                                                      |
| --------------------------- | --------------------------------------------------------- |
| `model.ts`                  | pure state、view model、reducer                           |
| `schema.ts`                 | Web-local runtime validation                              |
| `api.ts`                    | Eden client adapter                                       |
| `queries.ts`                | TanStack Query options                                    |
| `hooks/use-*-controller.ts` | ブラウザーで動くAPI呼出、ルーター、通知等と表示状態の接続 |
| `index.ts`                  | ブラウザーから利用できる機能の公開API                     |
| `server.ts`                 | サーバー側の合成処理から利用する機能の公開API             |

Web-local schemaはAPI transport typeの代用品ではありません。Agentの公開thread、message page、run、
action、execution、approval、context revocation、UIMessage streamは
`@enterprise-agentic-saas/agent-contracts`のschemaを直接使います。Web-local schemaはcomposer draftや
context switch state等、HTTP responseではないWeb固有projectionのruntime validationに限定します。

同じrepositoryが所有するElysia APIの成功response型は
`@enterprise-agentic-saas/api/client`の`ApiClient`とEden `Treaty.Data`から導出します。featureの
`api.ts`は公開clientの`unwrapEdenResult`だけでTreaty resultを絞り込み、同じresponseをWeb側の
Valibot schemaへ再宣言したり二重にparseしたりしません。このhelperは`error !== null`を判定し、
成功値とnative Eden errorを変換せず返すかthrowします。form、URL/search parameter、browser storage、
third-party response、XHR response、Agent cross-runtime contractのruntime validationは各所有境界に残します。

`model.ts`、reducer、view-modelはReact、TanStack Query、TanStack Router、通知、APIクライアント、
`fetch`、`useChat`、browser APIをimportしません。別featureのUIから利用できるのは`index.ts`が
明示exportしたブラウザー用契約、サーバーの合成処理から利用できるのは`server.ts`が公開した
契約です。実行時検証だけが必要な`adapter`は、feature rootの`schema.ts`をデータだけの
公開entrypointとして利用できます。`src/lib/browser/**`と`src/lib/server/**`の合成処理は、
UIを含む`index.ts`を評価せずfeatureのクライアント`adapter`を生成するために、feature rootの`api.ts`を
直接importできます。公開する`schema.ts`と`api.ts`はコンポーネント、Query、router、toast、ブラウザー固有
またはサーバー固有のモジュールをimportせず、`components/`と`queries.ts`は公開面へ流しません。

### ブラウザーのサーバー状態

ブラウザーで取得するサーバー状態と`mutation`はTanStack Queryへ集約します。既定の再試行、
エラー変換、`staleTime`等の共通方針は`QueryClient`生成時に確定し、コンポーネントのマウント後に
書き換えません。コンポーネントごとの差分は`queryOptions`または`mutationOptions`へ明示し、
既定値の後付け変更によるマウント順依存を作りません。

`getRouter`はリクエストまたはブラウザーのルーターごとに新しい`QueryClient`を作り、
`setupRouterSsrQueryIntegration`でTanStack StartのSSRと接続します。初期取得が必要なルートの`loader`は
同じ`queryOptions`を`ensureQueryData`へ渡します。手書きの`dehydrate`、`HydrationBoundary`、
状態の横流し用Web独自コンポーネントを置きません。サーバーとブラウザーで同じリソースを読む場合は
リソース固有の`queryOptions`または`queryKey`生成関数を正本とし、`queryKey`には組織、リソース、
絞り込み等のキャッシュ範囲だけを含めます。Edenクライアント等の注入実装は`queryFn`だけで使い、
`queryKey`へ含めません。

## serverとbrowser

- `src/start.ts`は全サーバー関数に明示的なCSRF検証と公開可能な固定errorへの変換を適用する
- `src/server.ts`はCloudflare Workerの`composition root`として環境変数と可観測性を設定し、
  TanStack Startの標準handlerへリクエストを渡す
- サーバーだけのAPI呼び出しとCookie取得は`src/lib/server/**`へ置く
- ブラウザーから直接呼べるサーバー境界はTanStack Startの`createServerFn`で定義する
- ルートの`loader`が初期データとリダイレクトを担当し、画面コンポーネントは
  `Route.useLoaderData`またはTanStack Queryから表示状態を受け取る
- ブラウザーで動くコンポーネントは`src/components/**`または
  `src/features/**/components/**`、`controller`は`src/hooks/**`または機能内の`hooks/**`へ置く
- ブラウザーからサーバー環境変数、Node.js組み込みモジュール、サーバー実装を`import`しない
- TanStack Startの実験的React Server Componentsは使わない
- 公開文書の画像は`@unpic/react`を使い、認証付き画像は既存の`AuthenticatedFileImage`が
  APIのpreview URLからnative `srcset`を組み立てる

初期データを`loader`で取得できる画面では、全ての取得処理をコンポーネントのマウント後へ集めません。

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

`client.tsx`はcontroller hookを呼び、その戻り値を`view.tsx`へpropsとして渡す薄いブラウザーコンポーネント
です。`view.tsx`はpropsからDOMを描画します。この分割が不要な小さいcomponentは一fileに保ちます。

複数のasync state、cancel、approval、stream resumeが絡むflowはbooleanを増やさず、
discriminated unionまたはreducer/state machineへ移します。これにより不可能なstateを型で消し、
raceと復元をpure testで再現できます。

## SuspenseとError Boundary

ブラウザーコンポーネントがSuspense対応Query、`use()`、`lazy`/dynamic import等によりrender中にdata待ちに
なり得る場合は、Reactの`<Suspense>`とReact Error Boundaryを用意します。Error Boundaryとは、
browserで子componentがrender中にthrowした予期しないerrorを捕捉し、安全なerror表示とretry/resetを
出すReact componentを指します。

ルートの`loader`、`beforeLoad`、`createServerFn`で発生したエラーはルートの`errorComponent`、
待機状態は`pendingComponent`で扱い、後述のPlaywright W6で検証します。

一つの非同期画面は、必要に応じて次のfileを`components/<screen>/`へ置きます。

```text
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
- サーバー関数の入出力は直列化できる値に限定する

click後にだけ動くmutation、router、toast、focus変更等は、それだけを理由に`<Suspense>`で囲みません。
buttonをdisabledにする、pending textを出す、安全なerrorを表示する等、そのcomponentの通常stateとして
実装し、storyとBrowser Modeで検証します。

Ready、loading、errorは同じ外側のshell、grid column、header/body領域、content padding、
`min-height`、`scrollbar-gutter`を共有します。Skeletonは装飾ではなく、loading中のlayout spaceを
確保するcomponentです。`aria-busy`と安全なstatus labelを持ち、`aria-hidden`配下へbutton/linkを
残しません。Error表示は見出しへfocusし、`role="alert"`、安全なmessage、明示的なretry/resetを
提供します。

Error表示は`Error.message`、stack、cause、現在URL/query、API/providerのraw応答、
email、tenant/resource IDをDOM、accessible name、`aria-live`へ出しません。表示するのは固定の
利用者向け文言と、公開可と検証済みのrequest IDだけです。raw errorはlocal OpenTelemetryへ送り、
認証materialはcollectorで除去し、UIのpropsへ展開しません。

非同期`loader`を持つTanStack Routerのルートには、必要な待機、エラー、404表示を
`pendingComponent`、`errorComponent`、`notFoundComponent`として設定します。表示本体は機能の
`skeleton.tsx`または`error-view.tsx`を使い、ルートファイルに表示処理を重複させません。
`errorComponent`は`reset`だけをエラー表示へ渡し、生の`error`オブジェクトをpropsまたはDOMへ
渡しません。複数ルートで同じSkeletonまたはエラー表示を共有するのは、外側のshellと予約する
レイアウト領域が同じ場合だけです。各ルートの待機、エラー、再試行、準備完了の遷移は
Playwright W6で検証します。ルート固有の実行証跡は状態面の`data-route-boundary="true"`を検査し、
共有`data-console-shell`だけの遷移をそのルートの実行証跡には数えません。形状、フォーカス、
オーバーフローは代表ルートの共有境界対応表で重ねて検証します。

クライアント側のSuspense対応画面は対象コンポーネントのBrowser Modeテスト、非同期`loader`を
持つルートは実ルートを通るPlaywright W6で検証します。新しい画面やルートのレビューでは、
Skeleton、Error Boundary、ルートの境界設定と対応テストを同じ変更で確認します。

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
Sonner、router、Agent transportの具体実装はcontroller、またはcontroller hookを呼ぶブラウザーコンポーネント
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

Storybook projectがブラウザーで`import`できる公開コンポーネントと主要`View`にはnamed storyを
必須にします。対象はfirst-party `.tsx`モジュールの既定コンポーネント公開、uppercase named
function/class、`memo`/`forwardRef`/component HOC等へ解決される公開値で、ブラウザーの依存グラフから
サーバー専用の辺なしに到達できるものです。SSRでも使うpure componentを含みます。

- `packages/ui/src/**`のbrowser component
- `apps/web/src/**/*.tsx`から後述の構造上の除外を引いたbrowser component/view
- provider、portal、error、skeletonもbrowser import可能なら対象

構造上の除外はサーバー関数、`*.server.ts`とサーバー専用の依存グラフ、TanStack Routerの
`src/routes/**`、テスト、story、フィクスチャ、生成ファイル、コンポーネントではないJSX factory、
モジュールから公開しない局所helperだけです。React Email templateは
ブラウザーコンポーネントではなくEmail preview/render testが検証を担当します。ルートの表示本体を
ブラウザーで`import`できる場合はviewへ抽出し、そのviewにはstoryを作ります。未使用の旧コンポーネントはstory免除にせず
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
@enterprise-agentic-saas/agent-contracts
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
@/routes/**
```

同じfeature内部はrelative importを使い、別featureのUI契約は`@/features/<feature>`からimportします。
`schema.ts`と`api.ts`の例外を、コンポーネントや補助関数の非公開パスへ広げません。

追加のlayer規則:

- `model.ts`からcomponent/controller/adapterをimportしない
- `view`から`api.ts`、`queries.ts`、router、toast、Agent transportをimportしない
- `lib/shared`から`lib/browser`または`lib/server`へ依存しない
- app-wide `components/**`からdomain featureへ逆依存しない
- ブラウザーのパスからNode.js組み込みモジュールとサーバー実装を`import`しない
- `routes/**`を再利用レイヤーとして機能から`import`しない

```ts
// same feature: allowed
import { reduceDraft } from "../model"

// cross feature: allowed
import { IssueLink } from "@/features/issues"

// Eden-derived response type and Web-owned form schema: allowed
import {
  organizationFormSchema,
  type OrganizationSummary,
} from "@/features/organizations/schema"

// cross feature private path: forbidden
import { IssueLink } from "@/features/issues/components/issue-link"
```

## テスト配置

- pure model/schema/error mapping: `bun run test`
- component DOM/controller: `bun run test`
- story interaction/a11y: `bun run test:browser`
- feature browser integration: `bun run test:browser`
- loading/error/readyのlayout stability: `bun run test:browser`
- `loader`、ルーティング、Cookie、オリジンをまたぐ処理: `bun run test:browser`

## 理由と代償

### 理由

- サーバー関数、ルート`loader`、ブラウザーコンポーネントの責務が明確になる
- side effectをviewから分離し、Storybookとunit testを使いやすくする
- 待機、エラーを付随的なルート代替表示ではなく同じレイアウト契約の状態として扱い、
  navigation時のlayout shift、focus loss、retry不能を防ぐ
- public componentと主要ViewをStorybook catalogueへ置き、未到達stateとa11y regressionを実装時に発見する
- cross-feature couplingをpublic entrypointへ限定する

### 代償

- controller/view分割にpropsが増える
- Story、Skeleton、Error Boundary componentの保守対象が増える
- UI固有projectionにはWeb-local schemaが追加される
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

MCP OAuthのscope matrixは対象5行と操作5列が固定され、sort、filter、pagination、列表示stateを持たないため、
TanStack Tableと共通DataTable rendererを使いません。`packages/ui`の`Table`、`TableHeader`、`TableBody`、
`TableRow`、`TableHead`、`TableCell`を直接組み合わせ、scope定義、選択集合、一括選択だけをfeatureが所有します。
横overflowとscroll regionは`Table` primitiveの標準containerへ委ねます。

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
`useSearchParams`と`useQueryStates`はクライアント専用モジュールへ閉じ、サーバーから利用できる
parser・serializerのbarrelから再公開しません。

## 受入条件

- `src/routes/`に再利用される大規模な画面コンポーネントがない
- viewからQuery/router/toast/API importがない
- ブラウザーのコードからサーバー実装への`import`がない
- 認証付き画像がUnpicまたは公開画像の最適化経路へ渡らない
- cross-feature deep importがない
- 新規または変更したpublic componentと主要Viewに実componentを描画するnamed storyがある
- feature directory直下にReact componentの`.tsx`がない
- client render中に待機し得るcomponentに`<Suspense>`、Skeleton、React Error Boundary、
  Browser Mode testがある
- 非同期`loader`を持つルートに必要な`pendingComponent`、`errorComponent`、Playwright W6がある
- Error Boundaryがraw error、URL/query、private identifierをDOMまたは読み上げ領域へ出さない
- ready/loading/error transitionでlayout shiftとhorizontal overflowがない
