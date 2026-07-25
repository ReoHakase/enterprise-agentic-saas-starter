---
title: Storybookとブラウザーコンポーネントテスト仕様
status: accepted
implementation: active
last_reviewed: 2026-07-26
applies_to:
  - apps/web/**
  - packages/ui/**
---

# Storybookとブラウザーコンポーネントテスト仕様

## 目的

Storybookは単一のテスト層ではありません。storyは、状態カタログ、Controls、操作テスト、a11y検査、MSW handler、将来の視覚回帰テスト入力を兼ねる実行可能fixtureです。

テスト分類はStorybookを使うかではなく、何を接続しているかで決めます。

## Storybookの分離

### `packages/ui`

- `@storybook/react-vite`を使う
- domain非依存のprimitive、pattern、generic hookを対象にする
- API client、React Query、Next.js route、auth session、tenant logicを持ち込まない
- MSWが必要になるcomponentは、原則として`apps/web`へ置くべきか再検討する

### `apps/web`

- `@storybook/nextjs-vite`を使う
- feature固有component、QueryClient、Agent UI、認証状態の表示を対象にする
- Next.js navigation mock、QueryClient、theme、locale、notification、auth fixtureをdecoratorで提供する
- HTTP状態はMSW、Agent streamはfake transportを優先する

二つのStorybookを分離し、必要ならcompositionまたはStorybook MCPで横断的に参照します。

## CSF Next

CSF Nextの`defineMain`、`definePreview`、`preview.meta`、`meta.story`を採用します。

採用理由:

- addonの型がstoryへ伝播する
- meta、args、parameters、beforeEachの型安全性が高い
- MSW addonの現行APIと整合する
- story fileのboilerplateを減らせる

注意点:

- CSF Nextはpreview機能であるため、Storybook packageを同一exact versionへ固定する
- Storybook upgradeは専用PRにする
- 一つのstory file内でCSF 3とCSF Nextを混在させない
- 実験的なstory `.test` APIは導入せず、安定した`play`を使う

## コンポーネント粒度と分類

| コンポーネント粒度           | 主な配置                                                             | 分類                  | Storybookで扱う内容                                                 | Storybook外へ残す内容                 |
| ---------------------------- | -------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------- | ------------------------------------- |
| UI primitive                 | `packages/ui/src/components/**`                                      | UI2、UI3              | props、variant、disabled、destructive、ARIA、keyboard、focus、theme | app domain、API、route                |
| UI複合pattern                | `packages/ui/src/patterns/**`                                        | UI2、UI3、必要ならUI4 | 複数primitiveの協調、dialog、menu、form、focus return               | API、QueryClient、tenant              |
| Web表示専用component         | `apps/web/features/**/components/**`                                 | W2、W3                | loading、empty、error、ready、callback、代表操作                    | query cache、route lifecycle          |
| Web接続済みfeature           | `features/**/components/<screen>/client.tsx`、controller composition | W4                    | QueryClient、mutation、MSW、stream、retry、複数component            | 実Next.js route、middleware           |
| routeから切り出したPage View | `features/**/components/**`                                          | W3またはW4            | page相当の表示、代表操作、responsive state                          | RSC、cookie、browser history          |
| 実page、layout、middleware   | `apps/web/app/**`、`middleware.ts`                                   | W5、W6                | 原則storyへ直接入れない                                             | server判断はW5、実route lifecycleはW6 |
| 全構成journey                | `apps/web/e2e/**`                                                    | E1、E2                | Storybook対象外                                                     | Web、API、Agent、DB/Authの全配線      |

### 同じcomponentでも接続範囲で分類が変わる例

```text
IssueCardへargsでissueを渡す
  W3

IssuePanelがQueryClientとMSWでissueを取得する
  W4

実Next.js routeがURLからissueNumberを解決する
  W6

実APIとDBからissueを取得する
  E1
```

## storyを作る対象

### 原則としてstoryを作る

- `packages/ui`のpublic component
- 再利用されるUI pattern
- Web featureの主要View
- loading、error、empty、pending、disabledを持つcomponent
- focus、keyboard、dialog、menuのcontractを持つcomponent
- approval、destructive action、retryを持つcomponent
- dark theme、mobile、長文、overflowへ感度が高いcomponent

### 親storyへ含める

- 親からしか使わないprivate subcomponent
- 単独では意味を持たないlayout fragment
- icon wrapper、separator、内部row
- 親の操作または状態の一部としてのみ観測されるcomponent

### storyを作らない

- 薄い`page.tsx`、`layout.tsx`
- middleware
- pure server loader
- redirect decision
- API adapter
- provider composition

route固有componentは表示部分をViewへ分離し、Viewをstory化します。

## 標準ファイル配置

Web全体と`packages/ui`のcomponentは常にdirectoryへ昇格し、本体、test、story、fixtureを同じdirectoryへ置きます。

```text
component-name/
  component-name.tsx
  component-name.test.tsx
  component-name.stories.tsx
  component-name-parts.tsx
  fixtures.ts
```

画面責務を持つWeb componentは`components/<screen>/{client,server,view,...}.tsx`へ分割し、feature rootへ本番`.tsx`を置きません。private subcomponentはpublicな親story内で実物が描画・操作される場合、個別storyを要求しません。

`packages/ui`で複数directoryの公開componentを組み合わせ、form、overlay、data display、
navigation等の利用例を検証するstoryに限り、`packages/ui/src/components/*.stories.tsx`へ置けます。
この配置は個別componentの同居storyを置き換えません。component本体、単一componentだけのstory、
本番でimportする`.tsx`は`components/`直下へ置かず、必ず所有directoryへ置きます。

## Controls

Controlsは手動探索と状態共有に使います。Controlsが表示されること自体を回帰テストとは見なしません。

方針:

- componentのpublic propsは`args`へ置く
- enumは`select`、booleanは`boolean`、数値境界は`range`など適切なcontrolを指定する
- callbackはspyまたはactionとして観測する
- controlled componentでは`useArgs`でstory UIとControlsを同期できる
- Controlsのためだけにproduction componentへ内部状態用propsを追加しない
- JSX、class instance、関数など複雑な値はprimitiveな選択肢から`mapping`またはstory harnessで変換する
- secret、token、private URLをargsへ置かない

## `play` function

`play`はstory render後の代表操作とassertionに使います。

置くもの:

- 代表的なclick
- keyboard navigation
- focus移動とfocus return
- dialog、popover、menuのopen/close
- form入力とvalidation
- retryまたはapprovalの状態遷移
- accessible role、name、visible outputのassertion

置かないもの:

- 全props組合せ
- production network
- DB整合性
- route lifecycle
- animationのフレーム単位assertion
- 任意時間の`sleep`

操作は`step`で意味単位に分け、Storybook UIからpause、resume、rewind、step実行できる形にします。

## a11y

- `@storybook/addon-a11y`を導入する
- standard storyでは`parameters.a11y.test = "error"`を設定する
- axe-coreによる自動検査は第一線の検査であり、全アクセシビリティを保証するものではない
- keyboard、focus restoration、accessible name、reduced motion、zoom、screen reader上の意味は別のassertionまたは手動確認を持つ
- 既知問題を広い`todo`で隠さず、story単位、rule単位、期限付きで扱う

## MSW

### 使用する場所

- `apps/web`のW4
- Suspense、Error Boundary、retry、network errorを含むconnected feature
- HTTP transport自体をUIへ接続する必要があるstory

### 使用しない場所

- `packages/ui`のprimitive
- propsだけで表現できるW3
- Agent message partを直接制御できるfake transport
- API契約の正しさそのものの証明

### CSF Nextでの登録

- `preview.ts`で`addonMsw()`を登録する
- `parameters.msw`は使わず、projectまたはstoryの`beforeEach({ msw })`で`msw.use()`する
- `msw-storybook-addon/types`をStorybook用TypeScript設定へ含める
- story間でhandlerを自動resetする
- unhandled requestはassetとStorybook内部requestを除き、原則errorとして検出する

### Elysia、Eden型の利用

- `@enterprise-agentic-saas/api/client`からpublic endpoint型だけをexportする
- `Treaty.Data<T>`で成功body型を抽出する
- `Treaty.Error<T>`とstatusによる`Extract`でerror body型を抽出する
- fixtureは`satisfies`で型検査する
- statusとbodyをtyped response factoryへ閉じ込める
- MSWのURL文字列、method、path parameterはEden型だけでは完全に保証されないため、A4とA5を契約の正本とする

## Suspense、Error Boundary、通信状態

| 状態                  | 表現                                     | 分類 | 自動実行               |
| --------------------- | ---------------------------------------- | ---- | ---------------------- |
| propsによるloading    | `loading` propまたはView model           | W3   | する                   |
| Query loading         | 実QueryClient + MSW finite delay         | W4   | する                   |
| empty                 | `200`と空collection                      | W4   | する                   |
| validation error      | typed `400`または`422`                   | W4   | する                   |
| not found             | typed `404`                              | W4   | する                   |
| conflict              | typed `409`                              | W4   | する                   |
| server error          | typed `500`                              | W4   | する                   |
| network error         | `HttpResponse.error()`                   | W4   | する                   |
| retry success         | 最初は失敗、次は成功するstateful handler | W4   | する                   |
| Error Boundary reset  | `QueryErrorResetBoundary`とretry操作     | W4   | する                   |
| infinite loading      | infinite delay                           | W4   | manual tagで自動対象外 |
| Next.js `loading.tsx` | 実route lifecycle                        | W6   | 代表routeだけ          |
| Next.js `error.tsx`   | 実route lifecycle                        | W6   | 代表routeだけ          |

自動テストでは有限delayまたは制御可能なdeferred promiseを使います。無限loadingは目視専用storyにします。

## theme、viewport、animation

- lightで全interactionとa11yを実行する
- darkはtheme-sensitive storyだけを実行する
- desktop、mobile、theme、browserの全直積を作らない
- mobileはlayout boundaryを持つ代表stateだけを選ぶ
- CIではanimation duration、clock、UUID、randomを固定する
- 目視用slow-motion storyは`manual`または`!test` tagで自動実行から外す

## Storybook MCP

Storybook MCPは、story catalogueが安定した後に開発支援として導入します。

用途:

- Agentへ既存component、props、stories、docsを提供する
- Agentが関連storyだけを実行して自己検証する
- `packages/ui`と`apps/web`のStorybookをcompositionして横断利用する

MCPはCIの正本ではありません。テストの合否はVitest、Storybook addon、静的検査が決定します。
