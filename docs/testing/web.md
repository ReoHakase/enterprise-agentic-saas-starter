---
title: Webテスト戦略
status: accepted
implementation: active
last_reviewed: 2026-07-25
applies_to:
  - apps/web/**
  - packages/ui/**
---

# Webテスト戦略

## テストピラミッド

| layer | 対象                                             | runner                               | script         |
| ----- | ------------------------------------------------ | ------------------------------------ | -------------- |
| W1    | model、schema、error mapping                     | Vitest Node                          | `test`         |
| W2    | component/controller DOM                         | Vitest + Testing Library + happy-dom | `test`         |
| W3    | story interaction、a11y、light/dark              | Storybook Vitest addon + Chromium    | `test:browser` |
| W4    | QueryClient、Agent transport integration         | Vitest Browser Mode                  | `test:browser` |
| W5    | Server Component loaderから分離したpure function | Vitest Node                          | `test`         |

## ファイル配置

基本:

```text
component.tsx
component.test.tsx
component.stories.tsx
```

`browser.test.tsx`はW4だけに使います。VRT fileは作りません。

## Storybook

- `light`: 全interactionとa11y
- `dark`: theme-sensitive storyだけ
- stateを`loading`、`empty`、`error`、`success`、`dialog-open`等の英語で表す
- play testは代表interactionだけ
- Agent storyとBrowser Mode testは同じ小さいsynthetic fixtureを共有

Storyは見た目のcatalogだけでなく、production viewが受け取るstate/action contractを使います。
component専用の別modelや、testだけ通る簡略hookを作りません。

### story coverage

Storybookでimport可能な全componentへstoryを作ります。対象は`packages/ui/src/**`と
`apps/web/**/*.tsx`から構造上の除外を引いたbrowser component/viewです。`app/**`もrootごと除外せず、
非special fileがbrowser import可能ならstory化します。public exportだけでなく、productionの
別fileからimportされるprivate componentも含めます。

構造上の除外はasync Server Component/`server-only` graph、Next.js route special file、
test/story/fixture、
generated、non-component JSX factory、module非exportの局所helper、non-visual hook/libです。
route special fileが表示を持つ場合はbrowser viewへ抽出してstory化します。
repo全体を走査するstory coverage checker、独自AST、import graph、例外registryは持ちません。
新しいbrowser componentとstoryを同じ変更でreviewし、登録済みstoryの実render、interaction、
a11yはStorybook/Browser Mode testで検証します。一つのmoduleが複数componentをexportする場合や、
同じ画面のReady、Loading、Errorをまとめる場合はstory fileを共有できます。dead/legacy componentは
例外にせず削除します。

各storyはproduction componentとcanonical fixtureを使い、実装可能なstateを網羅します。最低限の
`Default`だけでloading/error/empty/pending/permission等を隠さず、公開stateがあるcomponentは対応する
storyを持ちます。interactionは`light`で一度、theme差があるstateだけ`dark`で再実行します。

## Browser Modeへ置くもの

- focus、keyboard、dialog、portal
- browser API
- real CSS visibility
- 複数componentのinteraction
- AI SDK stream + mock transport
- loading、ready、error、retry間のlayout stability

Agent UIはnetwork/transportだけをmockし、`useAgentChatSession`、parser、controller、componentを
mockしません。productionとtestが同じstream parser、canonical message変換、state transitionを
通ることで、UI testが実配線から乖離することを防ぎます。

## Table interactionとfocusの安定性

TanStack Tableのinline編集は、mutation中の`readOnly`と`aria-busy`だけでなく、row IDとcolumn
rendererのidentityを固定します。`busyIssueId`や`pending`をcolumn定義の依存へ直接入れるとcell
rendererが差し替わり、focus可能なtriggerでも再mountされるため禁止します。

Testing LibraryまたはBrowser Modeでは、pending化、query反映、`updatedAt`等によるrow reorderを
跨いでも同じtrigger DOM nodeとfocusが維持されることを検証します。Issue priority等のone-shot delay中も
triggerを`disabled`にせず、`readOnly`と`aria-busy`で操作中であることを表します。

## SuspenseとError Boundaryのlayout stability

Client ComponentがSuspense対応Query、`use()`、`lazy`/dynamic import等によりrender中にdata待ちに
なり得る場合は、Reactの`<Suspense>`、Skeleton、React Error Boundaryを持ちます。Error Boundaryは、
browserで子componentがrender中にthrowした予期しないerrorを捕捉して安全なerror表示とretry/resetを
出すcomponentです。

async Server Componentのerrorはclient用React Error Boundaryでは捕捉できません。Next.js route
segmentの`loading.tsx`と`error.tsx`で扱い、Playwright E2で検証します。

click後だけに動くmutation、router、toast等は、それだけを理由に`<Suspense>`を追加しません。
そのcomponentのpending、success、error stateとして検証します。pure viewや、親から渡された
callbackを呼ぶだけのleafも、独自の非同期処理がなければ`<Suspense>`を追加しません。

client側のSuspense、Skeleton、React Error Boundaryは対象componentのBrowser Mode test、
async Server Component routeの`loading.tsx`、`error.tsx`、retryは実routeのPlaywrightで確認します。
新しい対象を追加するreviewで対応fileとtestを確認し、独自source graphや対応manifestを作りません。

client用Error Boundary testは`Error.message`、`digest`、stack、cause、URL/query、
API/provider raw応答、email、tenant/resource IDごとに固有のsentinelを含むerrorをthrowさせます。
固定の利用者向け文言とretry/resetだけが見え、sentinelがDOM text、accessible name、
`role="alert"`、`aria-live`、focus先の見出しへ現れないことをassertします。公開可と検証済みの
request IDを表示する場合は、許可した形式だけを別caseで検証します。Next.jsの`error.tsx`は同じ確認を
E2で行います。

client側のBrowser Modeでは最小のstate harnessまたは必要な範囲だけのtransport stubで、
componentが所有する遷移を同じtest内に発生させます。route stateの代表testは次を確認します。

```text
loading -> ready
ready -> error -> retry -> ready
```

real networkへ依存せず、loadingを観測できる決定的なstate遷移だけを使います。固定viewportで次を
assertします。

- loading、error、readyが共通の`data-slot="page-shell"`を使う
- loadingとerrorのreserved widthが一致する
- `scrollWidth <= clientWidth`でhorizontal overflowがない
- loadingはstatusを通知し、errorではheadingへfocusし、retry後にreadyへ戻る

可変長listはviewport内のstable chromeを動かさず、同じdeterministic fixtureに対してSkeletonが
ready stateのminimum block sizeを予約します。予約領域より長いready contentだけを下方向へ伸ばすか
内部scrollへ入れます。任意のrow数でbody heightが同一とは要求しません。textの長さを固定して
通すだけでなく、短い/長いsynthetic fixtureとデスクトップ、モバイル表示を検証します。

async Server Component、Next.js route segmentの`loading.tsx` / `error.tsx`、navigation中の
layout保持はBrowser Modeで再現しません。Playwright E2で同じSkeleton/error viewが使われることと、
ready/loading/errorのsidebar、header、content、PageShellのbounding box、focus、retry、
horizontal overflowをデスクトップで比較します。代表モバイル表示では公開ルートとテナントルートの
主要表示とhorizontal overflowを確認します。

これはpixel screenshotやbaseline比較ではなく、DOM geometryを使うdeterministic contractです。
VRTをdeferする決定とは矛盾しません。

## canonical fixture

StorybookとBrowser Modeは、context meterとconversation viewportに必要なhand-authored synthetic
fixtureだけを共有します。provider responseをrecordせず、scenario manifestやtest layer mappingを
別途作りません。fixtureはbounded textだけを持ち、base64、private URL、object key、credential、
real tenant dataを含めません。

## Playwrightへ残すもの

- async Server Component
- Next route、middleware、cookie
- cross-origin、CORS、CSRF
- reloadを跨ぐsession
- 実際のnetwork request/response

細かなpane state、shortcut、focus、dialog、stream part表示はL4へ寄せます。Playwrightは
Server Component、
cookie、Worker、Service Binding、reloadを含む配線だけを重複なく確認します。

## 実行条件

- Web model/component変更: `test`
- interactive UI、a11y、Storybook変更: `test:browser`
- client Suspense/Skeleton/Error Boundary変更: `test:browser`
- async Server Component、Next.js `loading.tsx` / `error.tsx`変更: E2
- route/auth/cookie/API contract変更: E1またはE2

## 受入条件

- E2Eに細かなcomponent stateを持ち込まない
- happy-domでlayout/focusを保証しない
- storyとbrowser fixtureが重複しない
- darkで全interactionを重複実行しない
- exported browser componentにnamed storyがあり、Storybook/Browser Mode testが成功する
- clientの主要な待機状態に`<Suspense>`、Skeleton、Error Boundary、Browser Mode testが揃う
- async Server Componentのrouteごとに`loading.tsx`、`error.tsx`、E2 geometry testが揃う
- Error BoundaryのDOMと読み上げ領域にraw error、URL/query、private identifierが出ない
- loading/error/ready/retryでlayout shiftとhorizontal overflowがない
