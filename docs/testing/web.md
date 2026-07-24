---
title: Webテスト戦略
status: proposed
implementation: planned
last_reviewed: 2026-07-24
applies_to:
  - apps/web/**
  - packages/ui/**
---

# Webテスト戦略

## テストピラミッド

| layer | 対象 | runner | script |
| --- | --- | --- | --- |
| W1 | model、schema、error mapping | Vitest Node | `test` |
| W2 | component/controller DOM | Vitest + Testing Library + happy-dom | `test` |
| W3 | story interaction、a11y、light/dark | Storybook Vitest addon + Chromium | `test:browser` |
| W4 | QueryClient、MSW、Agent transport integration | Vitest Browser Mode | `test:browser` |
| W5 | Server Component loaderから分離したpure function | Vitest Node | `test` |

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
- mock Agent APIはcanonical fixtureを共有

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
coverage checkerはcomponent export、production import、Storybook storyの`component`/`render`を
解析し、componentのexport単位coverage、実componentを参照しないstory、例外metadataを検証します。
exact path、理由、責任者、削除条件の
ない例外はfailです。

一つのmoduleが複数componentをexportする場合や、同じ画面のReady、Loading、Errorをまとめる場合は
story fileを共有できます。checkerは、browserからimportできる各componentが少なくとも一つの
named storyで実際に描画されること、storyが実componentをimportしていること、参照先のないstoryが
ないことを検証します。componentとstoryの対応を別manifestへ手書きしません。同じcomponentは複数の
state storyで描画できます。cross-module integration storyだけでは個別componentのcoverageを
代用しません。dead/legacy componentは例外にせず削除します。

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

architecture checkはcomponentのsourceとimportを解析します。client側でSuspense対応APIや`lazy`等を
使う画面には`<Suspense>`、Skeleton、React Error Boundary、Browser Mode testを要求します。
async Server Componentを使うrouteには`loading.tsx`、`error.tsx`、共通Skeleton/error view、
Playwright E2を要求します。人が対応IDやmanifestを手書きしません。

client用Error Boundary testは`Error.message`、`digest`、stack、cause、URL/query、
API/provider raw応答、email、tenant/resource IDごとに固有のsentinelを含むerrorをthrowさせます。
固定の利用者向け文言とretry/resetだけが見え、sentinelがDOM text、accessible name、
`role="alert"`、`aria-live`、focus先の見出しへ現れないことをassertします。公開可と検証済みの
request IDを表示する場合は、許可した形式だけを別caseで検証します。Next.jsの`error.tsx`は同じ確認を
E2で行います。

client側のBrowser Modeではcontrollable promiseまたはmock transportで次の遷移を同じtest内に
発生させます。

```text
loading -> ready
loading -> error
error -> retry -> ready
ready -> refetch/pending -> ready
```

controlled deferred promiseとone-shot rejectを使い、`waitForTimeout`やreal networkへ依存しません。
`PerformanceObserver`は遷移前に登録し、描画settle後に`takeRecords()`までdrainします。固定viewport、
font load完了、fixed clock/ID、animation無効の条件で、shell、header、main、aside、primary action等の
stable slotについて次をassertします。

- `<Suspense>`とError Boundaryより外側のshellは同じDOM nodeを維持する
- shell/inset/header/page-headerとdynamic bodyのx/y/widthは1 CSS px、stable chromeのheightは
  1 CSS px、fixed dialog/overlayの全dimensionは2 CSS pxを超えて変化しない
- 全`LayoutShift` entryを収集し、stable slotまたは許可したdynamic region外をsourceに持つshiftは
  `hadRecentInput`に関係なく0件。non-zeroなのに`sources`が空のentryはfail-closedにし、加えて
  `hadRecentInput === false`の累積値が0
- `scrollWidth <= clientWidth`でhorizontal overflowがない
- loadingはstatusを通知し、errorではheadingへfocusし、retry後にreadyのfocus順へ戻る
- skeleton/error/readyで同じreserved width、minimum height、grid、scrollbar gutterを使う
- error focusでscroll positionを飛ばさず、dialog/portal/focus trapを不要にremountしない

可変長listはviewport内のstable chromeを動かさず、同じdeterministic fixtureに対してSkeletonが
ready stateのminimum block sizeを予約します。予約領域より長いready contentだけを下方向へ伸ばすか
内部scrollへ入れます。任意のrow数でbody heightが同一とは要求しません。textの長さを固定して
通すだけでなく、短い/長いsynthetic fixtureとdesktop/mobile viewportを検証します。

async Server Component、Next.js route segmentの`loading.tsx` / `error.tsx`、navigation中の
layout保持はBrowser Modeで再現しません。Playwright E2で同じSkeleton/error viewが使われることと、
ready/loading/errorのsidebar、header、content、PageShellのbounding box、focus、retry、
horizontal overflowをdesktop/mobileで比較します。

これはpixel screenshotやbaseline比較ではなく、DOM geometryとLayout Instability APIを使う
deterministic contractです。VRTをdeferする決定とは矛盾しません。

## canonical fixture

Storybook、Browser Mode、E1、stream parser testは、privacy review済みのhand-authored fixtureを
共有します。provider responseをrecordしてfixture化しません。

version管理するminimum scenario ID:

```text
idle
initial-loading
empty-thread
streaming-text
streaming-reasoning
running-tool
completed-read-tool
approval-required
approval-accepted
approval-rejected
expired-approval
tool-error
provider-error
disconnect
abort
resume
duplicate-stream-part
malformed-stream-part
context-near-limit
attachment-uploading
attachment-failed
```

さらにsource、transient status、multi-tool、reload、archived thread、mention、private metadata非表示を
該当scenarioのvariantとして持ちます。scenario manifestはStorybook、Browser Mode、stream parser、
E1/E2のどこで各IDを検証するかを列挙し、ownerなし、重複した別fixture、stale IDをfailします。

fixtureはsynthetic ID、bounded text、expected canonical partsを持ち、base64、private URL、object key、
credential、real tenant dataを含めません。

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
- browserからimportできるcomponentのstory coverageが100%
- client render中に待機し得るcomponentごとに`<Suspense>`、Skeleton、Error Boundary、
  Browser Mode geometry testが揃う
- async Server Componentのrouteごとに`loading.tsx`、`error.tsx`、E2 geometry testが揃う
- Error BoundaryのDOMと読み上げ領域にraw error、URL/query、private identifierが出ない
- loading/error/ready/retryでlayout shiftとhorizontal overflowがない
- minimum Agent scenario IDがcanonical fixtureとlayer coverage mappingを持つ
