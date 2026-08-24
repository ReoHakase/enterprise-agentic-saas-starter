---
title: Browser test記述規約
status: accepted
implementation: active
last_reviewed: 2026-08-01
applies_to:
  - apps/web/**/*.stories.tsx
  - apps/web/**/*.browser.test.tsx
  - apps/web/e2e/**
  - packages/ui/**/*.browser.test.tsx
  - packages/ui/**/*.stories.tsx
---

# Browser test記述規約

## 目的

Storybook interaction、Browser Mode、Playwrightで、利用者が観測できる契約を同じ方法で検証します。
DOM実装、実行順、固定時間へ依存せず、失敗時に待っていた状態が分かるtestを書きます。
シナリオのGiven-When-Then、BRIEF、所有層、test名とcommentの表記は
[テストケース設計・記述規約](test-case-design.md)を正本とします。

## Locatorの優先順位

次の順で最初に成立するlocatorを使います。

1. `role`とaccessible name
2. form controlのlabel
3. named region内のvisible text
4. `alt`または`placeholder`
5. 他に利用者向け意味を持たせられない場合だけ、限定したtest hookまたはCSS

`first()`、`last()`、`nth()`は順序自体が仕様の場合だけ使い、理由をtest名かhelper名へ残します。
意味情報が不足している場合はtest専用の迂回より、production DOMのlabel、role、regionを補います。

## 非同期状態との同期

- Storybook/Testing LibraryのDOM出現は`findByRole`、focusやcallbackの変化は`waitFor`を使います。
- PlaywrightのDOMはlocatorとweb-first assertionを使います。
- API反映や永続化は状態を読むcallbackを`expect.poll`へ渡します。
- loadingはrequest到達を待ち、`role="status"`を確認してからrequestを解放し、ready状態を待ちます。
- menuとdialogはactionable roleの出現、初期focus、close後のtriggerへのfocus returnを検証します。

固定sleep、`networkidle`、即時focus assertion、任意delayを観測窓にするtestは禁止します。timeoutは
同期方法の代わりに延長しません。

## PortalとDOM境界

Storybookのportalは`canvasElement.ownerDocument.body`を検索起点にします。global `document.body`、
Base UIのfocus guard、private属性、途中状態の`aria-expanded`を同期条件にしません。

Tailwind classやicon classは機能契約としてassertしません。geometryが仕様の場合だけ、名前付き専用helper
内でnarrow selector、bounding box、computed styleを使えます。座標比較は±1 CSS pxを許容し、
なぜsemantic assertionでは不足するかをhelperへ記録します。Next.js route lifecycleを観測するhelperも
同じ境界へ閉じます。

## 制御可能な非同期fixture

Storybookのstale responseとW6のloadingは、cleanup可能なdeferredまたはnamespace付き`RequestGate`を
使います。

1. gateをscenario固有namespaceで作る
2. actionまたはnavigationを開始する
3. `waitUntilRequested()`で対象request到達を待つ
4. loadingやstale response非反映をassertする
5. `release()`して最終状態を待つ

`release()`は成功・失敗にかかわらず`finally`で必ず呼びます。自動interactionで永久に解放しない
promiseを作りません。純粋な無限loading storyはmanual testとして扱います。

## 状態分離

QueryClient、MSW handler、localStorage、timer、module-level mutable stateはstory/testごとに初期化し、
cleanupします。create/update/deleteを一つの`play`へ連結せず、独立storyへ分けます。

E1はworkerごとにOAuth userと`storageState`を分け、scenarioごとにorganization、thread、Issueを
namespace化します。OAuth/WebAuthnはserialを維持し、対象passkeyだけをsetupと`finally`で削除します。
有料E2は1 worker、retry 0、artifact無効を維持し、明示承認なしに実行しません。

同じcallback mappingやvisible textをW2とW3で再検査しません。W3はfocus、keyboard、layout、
native renderingなど実ブラウザー固有の結果、W6は実Next.jsのURL、history、document scroll、
route lifecycleを`Then`として所有します。上位層を進めるための最小locatorとloading観測は残せます。

## 並列実行とartifact

- Web/UI Storybookは`fileParallelism: false`、`maxWorkers: 1`とし、light/darkを別invocationで直列実行します。
- free E1は隔離fixtureを使って2 workersまでとします。
- W6だけが代表WebKit coverageを所有し、free E1はUbuntu Chromiumで実行します。
- `test:browser`はTurbo cacheを使いません。
- report/resultsはfailure時だけuploadし、laneごとに一意なartifact名を使います。

CIはWeb components、UI components、W6へ分け、集約job `Browser`をbranch protectionの正本にします。

## 静的検査

Storybook interactionはawait漏れをlintで検出します。PlaywrightはW6を含め、native locator、
`no-force-option`、`no-element-handle`を適用します。geometry/route helper以外のraw CSS locatorは
semantic locatorへ置き換えます。

## 参照

- [Testing Library query priority](https://testing-library.com/docs/queries/about/)
- [Playwright best practices](https://playwright.dev/docs/best-practices)
- [Playwright assertions](https://playwright.dev/docs/test-assertions)
- [Storybook interaction testing](https://storybook.js.org/docs/writing-tests/interaction-testing)
